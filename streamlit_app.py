"""Streamlit companion app for MaCuisine.

This is intentionally separate from the React/Express application. Both
applications use the same recipe and database file formats.
"""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Any

import streamlit as st

try:
    from google import genai
except ImportError:  # pragma: no cover - gives Streamlit a useful setup error
    genai = None


ROOT = Path(__file__).parent
DB_PATH = ROOT / "server-data" / "db.json"
RECIPES_PATH = ROOT / "recipes"
DEFAULT_MODEL = "gemini-2.5-flash"
CATEGORIES = ["Marche", "Boucher", "Fromager", "Supermarche"]

DEFAULT_INGREDIENTS = [
    {"id": "1", "name": "Courgettes", "quantity": 2, "unit": "pieces", "category": "Marche"},
    {"id": "2", "name": "Oeufs", "quantity": 6, "unit": "pieces", "category": "Fromager"},
    {"id": "3", "name": "Pates", "quantity": 500, "unit": "g", "category": "Supermarche"},
]


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def default_state() -> dict[str, Any]:
    return {
        "ingredients": DEFAULT_INGREDIENTS.copy(),
        "recipes": [],
        "selectedRecipeIds": [],
        "manualShoppingItems": [],
    }


def load_state() -> dict[str, Any]:
    state = default_state()
    if DB_PATH.exists():
        try:
            loaded = json.loads(DB_PATH.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                state.update(loaded)
        except (OSError, json.JSONDecodeError):
            st.warning("Le fichier de donnees est invalide : les valeurs par defaut sont utilisees.")

    recipes = []
    if RECIPES_PATH.exists():
        for recipe_file in sorted(RECIPES_PATH.glob("*.json")):
            if recipe_file.name.startswith("TEMPLATE_"):
                continue
            try:
                recipe = json.loads(recipe_file.read_text(encoding="utf-8"))
                if recipe.get("name"):
                    recipes.append(recipe)
            except (OSError, json.JSONDecodeError):
                continue
    state["recipes"] = recipes
    return state


def save_state(state: dict[str, Any]) -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    DB_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def secret(name: str, fallback: str = "") -> str:
    try:
        return str(st.secrets.get(name, fallback))
    except (FileNotFoundError, KeyError):
        return os.getenv(name, fallback)


def gemini_client():
    api_key = secret("GEMINI_API_KEY")
    if not api_key or genai is None:
        return None
    return genai.Client(api_key=api_key)


def ask_ratatouille(messages: list[dict[str, str]], state: dict[str, Any]) -> str:
    client = gemini_client()
    if client is None:
        return "Ratatouille est indisponible : configurez GEMINI_API_KEY dans les secrets Streamlit."

    stock = "\n".join(
        f"- {item['name']}: {item['quantity']} {item['unit']}"
        for item in state["ingredients"]
        if float(item.get("quantity", 0)) > 0
    ) or "Stock vide"
    transcript = "\n".join(f"{item['role']}: {item['content']}" for item in messages[-20:])
    prompt = f"""Tu es Ratatouille, un assistant de cuisine chaleureux. Reponds en francais.
Stock actuel:
{stock}

Conversation:
{transcript}

Donne une reponse concise et pratique. Si l'utilisateur demande une modification
du stock, explique l'action mais ne pretends pas l'avoir faite automatiquement."""
    response = client.models.generate_content(
        model=secret("GEMINI_MODEL", DEFAULT_MODEL),
        contents=prompt,
    )
    return response.text or "Je n'ai pas de reponse pour le moment."


def show_recipe(recipe: dict[str, Any]) -> None:
    with st.expander(f"{recipe.get('name', 'Recette')} - {recipe.get('portions', 4)} personnes"):
        ingredients = recipe.get("ingredients", [])
        if ingredients:
            st.markdown("**Ingredients**")
            for ingredient in ingredients:
                st.write(f"- {ingredient.get('quantity', '')} {ingredient.get('unit', '')} {ingredient.get('name', '')}")
        st.markdown("**Instructions**")
        st.markdown(recipe.get("instructions", "Aucune instruction disponible."))


def main() -> None:
    st.set_page_config(page_title="MaCuisine", page_icon="🍳", layout="wide")
    st.title("MaCuisine")
    st.caption("Votre cuisine locale, vos recettes, votre assistant.")

    if "state" not in st.session_state:
        st.session_state.state = load_state()
    state = st.session_state.state

    with st.sidebar:
        st.header("Navigation")
        page = st.radio("Aller a", ["Accueil", "Recettes", "Courses", "Stock", "Ratatouille"], label_visibility="collapsed")
        st.divider()
        st.metric("Ingredients en stock", len(state["ingredients"]))
        st.metric("Recettes", len(state["recipes"]))

    if page == "Accueil":
        st.subheader("Bonjour, Chef !")
        col1, col2, col3 = st.columns(3)
        col1.metric("Stock actif", sum(float(i.get("quantity", 0)) > 0 for i in state["ingredients"]))
        col2.metric("Recettes selectionnees", len(state.get("selectedRecipeIds", [])))
        col3.metric("Courses ouvertes", sum(not i.get("completed", False) for i in state["manualShoppingItems"]))
        st.info("Utilisez Ratatouille dans la barre laterale pour obtenir une idee de repas ou gerer votre stock.")

    elif page == "Recettes":
        st.subheader("Votre livre de recettes")
        if not state["recipes"]:
            st.info("Aucune recette disponible dans le dossier recipes/.")
        for recipe in state["recipes"]:
            show_recipe(recipe)
            if st.button("Ajouter a la liste de courses", key=f"select_{recipe.get('id', new_id('recipe'))}"):
                if recipe.get("id") not in state["selectedRecipeIds"]:
                    state["selectedRecipeIds"].append(recipe["id"])
                    save_state(state)
                    st.rerun()

    elif page == "Courses":
        st.subheader("Liste de courses")
        for item in state["manualShoppingItems"]:
            checked = st.checkbox(
                f"{item.get('quantity', '')} {item.get('unit', '')} {item.get('name', '')}",
                value=item.get("completed", False),
                key=f"shopping_{item['id']}",
            )
            if checked != item.get("completed", False):
                item["completed"] = checked
                save_state(state)
        with st.form("add_shopping"):
            name = st.text_input("Ajouter un article")
            quantity = st.number_input("Quantite", min_value=0.1, value=1.0, step=0.5)
            unit = st.text_input("Unite", value="piece")
            if st.form_submit_button("Ajouter") and name.strip():
                state["manualShoppingItems"].append(
                    {"id": new_id("shopping"), "name": name.strip(), "quantity": quantity,
                     "unit": unit.strip(), "category": "Supermarche", "completed": False}
                )
                save_state(state)
                st.rerun()

    elif page == "Stock":
        st.subheader("Mon stock")
        for item in state["ingredients"]:
            col1, col2, col3, col4 = st.columns([3, 1, 1, 1])
            col1.write(f"**{item['name']}**")
            quantity = col2.number_input("Quantite", min_value=0.0, value=float(item.get("quantity", 0)), step=0.5, key=f"qty_{item['id']}")
            col3.write(item.get("unit", "piece"))
            if col4.button("Supprimer", key=f"delete_{item['id']}"):
                state["ingredients"] = [current for current in state["ingredients"] if current["id"] != item["id"]]
                save_state(state)
                st.rerun()
            if quantity != float(item.get("quantity", 0)):
                item["quantity"] = quantity
                save_state(state)
        with st.form("add_stock"):
            name = st.text_input("Nouvel ingredient")
            quantity = st.number_input("Quantite", min_value=0.0, value=1.0, step=0.5)
            unit = st.text_input("Unite", value="piece")
            category = st.selectbox("Rayon", CATEGORIES)
            if st.form_submit_button("Ajouter au stock") and name.strip():
                state["ingredients"].append(
                    {"id": new_id("ingredient"), "name": name.strip(), "quantity": quantity,
                     "unit": unit.strip(), "category": category}
                )
                save_state(state)
                st.rerun()

    elif page == "Ratatouille":
        st.subheader("Ratatouille, votre sous-chef")
        if "chat" not in st.session_state:
            st.session_state.chat = []
        for message in st.session_state.chat:
            with st.chat_message(message["role"]):
                st.markdown(message["content"])
        prompt = st.chat_input("Que cuisine-t-on aujourd'hui ?")
        if prompt:
            st.session_state.chat.append({"role": "user", "content": prompt})
            with st.chat_message("assistant"):
                with st.spinner("Ratatouille prepare une reponse..."):
                    answer = ask_ratatouille(st.session_state.chat, state)
                st.markdown(answer)
            st.session_state.chat.append({"role": "assistant", "content": answer})


if __name__ == "__main__":
    main()
