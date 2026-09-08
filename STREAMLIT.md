# Deployer MaCuisine sur Streamlit Community Cloud

Cette version ajoute `streamlit_app.py` sans remplacer l'application React/Express.

1. Pousser le depot GitHub.
2. Dans Streamlit Community Cloud, choisir le depot et le fichier `streamlit_app.py`.
3. Dans **Settings > Secrets**, ajouter :

```toml
GEMINI_API_KEY = "votre-cle-gemini"
GEMINI_MODEL = "gemini-2.5-flash"
```

Le fichier `requirements.txt` est installe automatiquement par Streamlit Cloud.

La persistance locale de Streamlit Cloud est ephemere. Pour conserver les stocks
entre les redemarrages, remplacez `save_state` par un stockage externe ou utilisez
la version Docker/React avec son volume `server-data`.
