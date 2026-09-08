import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

// Determine directory names in ES Module environment safely
const __filename = typeof import.meta !== 'undefined' && typeof import.meta.url === 'string'
  ? fileURLToPath(import.meta.url)
  : '';
const __dirname = typeof import.meta !== 'undefined' && typeof import.meta.url === 'string'
  ? path.dirname(__filename)
  : '';

const app = express();
const PORT = 3000;

// Setup lazy Gemini AI client
let aiInstance: GoogleGenAI | null = null;
function getGeminiClient() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY variable is missing. AI recipe suggestion & parsing features will be unavailable.");
    }
    aiInstance = new GoogleGenAI({
      apiKey: apiKey || "dummy_api_key",
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiInstance;
}

// Helper to generate content with automatic retries on 503 or transient capacity errors
async function generateContentWithRetry(ai: any, params: any, retries = 3, delay = 1000): Promise<any> {
  try {
    return await ai.models.generateContent(params);
  } catch (error: any) {
    const errorStr = (error.message || '') + ' ' + (typeof error === 'object' ? JSON.stringify(error) : '');
    const isTransient = error.status === 503 || 
                        error.code === 503 || 
                        errorStr.includes('503') || 
                        errorStr.includes('UNAVAILABLE') || 
                        errorStr.includes('high demand') ||
                        errorStr.includes('ResourceExhausted') || 
                        errorStr.includes('429') ||
                        errorStr.includes('OVERLOADED');
                        
    if (retries > 0 && isTransient) {
      console.warn(`[Gemini API] Transient error detected, retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return generateContentWithRetry(ai, params, retries - 1, delay * 2);
    }
    throw error;
  }
}

// Detect the best database directory, prioritizing volume mounts inside Docker containers (like /app/appcuisine)
const getDbDir = (): string => {
  if (fs.existsSync('/app/appcuisine')) {
    return '/app/appcuisine';
  }
  const localCuisine = path.join(process.cwd(), 'appcuisine');
  if (fs.existsSync(localCuisine)) {
    return localCuisine;
  }
  return path.join(process.cwd(), 'server-data');
};

const DB_DIR = getDbDir();
const DB_PATH = path.join(DB_DIR, 'db.json');

// Ensure the directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Define the interface matching /src/types.ts
interface Ingredient {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: 'Marché' | 'Boucher' | 'Fromager' | 'Supermarché';
}

interface RecipeIngredient {
  name: string;
  quantity: number;
  unit: string;
}

interface Recipe {
  id: string;
  name: string;
  instructions: string;
  ingredients: RecipeIngredient[];
  portions: number;
  ratingTaste?: number;
  ratingEase?: number;
  bookRef?: string;
  isCustom?: boolean;
}

interface DatabaseState {
  ingredients: Ingredient[];
  recipes: Recipe[];
  selectedRecipeIds: string[];
  manualShoppingItems: {
    id: string;
    name: string;
    quantity: number;
    unit: string;
    category: 'Marché' | 'Boucher' | 'Fromager' | 'Supermarché';
    completed: boolean;
  }[];
}

// Initial state data with convenient defaults
const DEFAULT_STATE: DatabaseState = {
  ingredients: [
    { id: '1', name: 'Courgettes', quantity: 2, unit: 'pièces', category: 'Marché' },
    { id: '2', name: 'Œufs', quantity: 6, unit: 'pièces', category: 'Fromager' },
    { id: '3', name: 'Pâtes', quantity: 500, unit: 'g', category: 'Supermarché' },
    { id: '4', name: 'Crème fraîche', quantity: 200, unit: 'ml', category: 'Supermarché' },
    { id: '5', name: 'Gruyère râpé', quantity: 150, unit: 'g', category: 'Fromager' },
    { id: '6', name: 'Tomates', quantity: 4, unit: 'pièces', category: 'Marché' },
    { id: '7', name: 'Poulet émincé', quantity: 400, unit: 'g', category: 'Boucher' }
  ],
  recipes: [],
  selectedRecipeIds: [],
  manualShoppingItems: []
};

// Recipes directory directly on the root workspace level for visible and persistent storage
const RECIPES_DIR = path.join(process.cwd(), 'recipes');
if (!fs.existsSync(RECIPES_DIR)) {
  fs.mkdirSync(RECIPES_DIR, { recursive: true });
}

// Standardized Recipe Templates for user and AI reference
const TEMPLATE_JSON = {
  "name": "Poulet à la Crème de Saison",
  "portions": 4,
  "bookRef": "Ma cuisine à moi - Template",
  "ratingTaste": 5,
  "ratingEase": 4,
  "ingredients": [
    { "name": "Émincé de poulet", "quantity": 500, "unit": "g" },
    { "name": "Crème fraîche épaisse", "quantity": 250, "unit": "ml" },
    { "name": "Champignons frais", "quantity": 200, "unit": "g" }
  ],
  "instructions": "1. Faire revenir les champignons émincés dans une poêle de beurre chaud.\n2. Saisir séparément les émincés de poulet.\n3. Réunir le poulet et les champignons, saler, poivrer, puis verser la crème entière.\n4. Laisser mijoter 5 minutes à feu très doux et servir avec du riz basmati."
};

const TEMPLATE_MD = `# Poulet à la Crème de Saison

- **Référence** : Ma cuisine à moi - Template
- **Portions** : 4
- **Note Goût** : 5
- **Note Facilité** : 4

## Ingrédients
- 500 g Émincé de poulet
- 250 ml Crème fraîche épaisse
- 200 g Champignons frais

## Instructions
1. Faire revenir les champignons émincés dans une poêle de beurre chaud.
2. Saisir séparément les émincés de poulet.
3. Réunir le poulet et les champignons, saler, poivrer, puis verser la crème entière.
4. Laisser mijoter 5 minutes à feu très doux et servir avec du riz basmati.`;

// Write standardized templates to the recipes folder for immediate inspector/user access
try {
  fs.writeFileSync(path.join(RECIPES_DIR, 'TEMPLATE_RECIPE.json'), JSON.stringify(TEMPLATE_JSON, null, 2), 'utf-8');
  fs.writeFileSync(path.join(RECIPES_DIR, 'TEMPLATE_RECIPE.md'), TEMPLATE_MD, 'utf-8');
} catch (tempErr) {
  console.error("Failed to write template recipe files:", tempErr);
}

// Dynamically load recipes from individual JSON files in recipes/
function loadAllRecipes(): Recipe[] {
  const loadedRecipes: Recipe[] = [];
  try {
    const files = fs.readdirSync(RECIPES_DIR);
    for (const file of files) {
      if (file.endsWith('.json') && !file.startsWith('TEMPLATE_')) {
        try {
          const content = fs.readFileSync(path.join(RECIPES_DIR, file), 'utf-8');
          const rec = JSON.parse(content);
          if (rec && rec.name) {
            loadedRecipes.push({
              id: rec.id || file.replace('.json', '').replace('rec_', ''),
              name: rec.name,
              instructions: rec.instructions || '',
              ingredients: Array.isArray(rec.ingredients) ? rec.ingredients : [],
              portions: rec.portions || 4,
              ratingTaste: rec.ratingTaste,
              ratingEase: rec.ratingEase,
              bookRef: rec.bookRef,
              isCustom: rec.isCustom ?? true
            });
          }
        } catch (e) {
          console.error(`Error reading recipe file ${file}:`, e);
        }
      }
    }
  } catch (err) {
    console.error('Error reading recipes folder:', err);
  }

  // If empty, seed with the template recipe as a starting default
  if (loadedRecipes.length === 0) {
    const defaultRecipe: Recipe = {
      id: 'poulet_creme',
      name: TEMPLATE_JSON.name,
      portions: TEMPLATE_JSON.portions,
      bookRef: TEMPLATE_JSON.bookRef,
      ratingTaste: TEMPLATE_JSON.ratingTaste,
      ratingEase: TEMPLATE_JSON.ratingEase,
      ingredients: TEMPLATE_JSON.ingredients,
      instructions: TEMPLATE_JSON.instructions,
      isCustom: true
    };
    try {
      fs.writeFileSync(
        path.join(RECIPES_DIR, `rec_poulet_creme.json`), 
        JSON.stringify(defaultRecipe, null, 2), 
        'utf-8'
      );
      loadedRecipes.push(defaultRecipe);
    } catch (seedErr) {
      console.error('Error seeding template recipe file:', seedErr);
    }
  }

  return loadedRecipes;
}

// Retrieve loaded database, merging state with individual folder-based recipes
function readDB(): DatabaseState {
  let state: DatabaseState;
  try {
    if (fs.existsSync(DB_PATH)) {
      const content = fs.readFileSync(DB_PATH, 'utf-8');
      state = JSON.parse(content);
    } else {
      state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  } catch (error) {
    console.error('Error reading database file, resetting to defaults:', error);
    state = JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  // Inject folders-based recipes
  state.recipes = loadAllRecipes();
  return state;
}

// Persist database and synchronize individual recipes in independent files
function writeDB(state: DatabaseState): void {
  try {
    // 1. Write core database file
    fs.writeFileSync(DB_PATH, JSON.stringify(state, null, 2), 'utf-8');

    // 2. Synchronize recipes to independent, folder-based JSON files
    if (state.recipes && Array.isArray(state.recipes)) {
      const activeIds = new Set<string>();

      for (const recipe of state.recipes) {
        if (!recipe.id) {
          recipe.id = 'rec_' + Math.random().toString(36).substr(2, 9);
        }
        activeIds.add(recipe.id);

        const recipeFilePath = path.join(RECIPES_DIR, `rec_${recipe.id}.json`);
        fs.writeFileSync(recipeFilePath, JSON.stringify(recipe, null, 2), 'utf-8');
      }

      // 3. Clean up deleted recipes (remove deleted files)
      try {
        const files = fs.readdirSync(RECIPES_DIR);
        for (const file of files) {
          if (file.endsWith('.json') && !file.startsWith('TEMPLATE_')) {
            const recipeId = file.replace('rec_', '').replace('.json', '');
            if (!activeIds.has(recipeId)) {
              fs.unlinkSync(path.join(RECIPES_DIR, file));
            }
          }
        }
      } catch (cleanErr) {
        console.error('Error cleaning up deleted recipe files:', cleanErr);
      }
    }
  } catch (error) {
    console.error('Error writing database file:', error);
  }
}

// Enable body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Local network IP restriction filter (LAN-only security guard)
function isLocalNetworkIP(ip: string): boolean {
  let cleanIp = ip.trim();
  
  // Normalize IPv6 mapped IPv4 addresses
  if (cleanIp.startsWith('::ffff:')) {
    cleanIp = cleanIp.substring(7);
  }

  // Loopback / Localhost / Inside Docker internal container default gateways
  if (
    cleanIp === '127.0.0.1' || 
    cleanIp === '::1' || 
    cleanIp === 'localhost' || 
    cleanIp === '::'
  ) {
    return true;
  }

  // Private networks (RFC 1918 IPv4)
  // Class A: 10.0.0.0 to 10.255.255.255
  if (/^10\./.test(cleanIp)) return true;

  // Class B: 172.16.0.0 to 172.31.255.255
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanIp)) return true;

  // Class C: 192.168.0.0 to 192.168.255.255
  if (/^192\.168\./.test(cleanIp)) return true;

  // Link-local IPv4: 169.254.0.0 to 169.254.255.255
  if (/^169\.254\./.test(cleanIp)) return true;

  // Private IPv6 ranges (Unique Local Address fc00::/7 & Link-local fe80::/10)
  if (/^(fc|fe[89ab])/i.test(cleanIp)) return true;

  return false;
}

// Security restriction middleware to enforce LAN-only access
app.use((req, res, next) => {
  if (process.env.RESTRICT_TO_LAN === 'true') {
    const host = (req.get('host') || '').toLowerCase();
    const xForwardedHost = (req.headers['x-forwarded-host'] as string || '').toLowerCase();
    const referer = (req.headers['referer'] as string || '').toLowerCase();
    const origin = (req.headers['origin'] as string || '').toLowerCase();
    
    // Auto-bypass restriction for Google AI Studio Cloud Run development and staging preview hostnames
    const isCloudPreview = 
      host.includes('run.app') || host.includes('aistudio.google') || host.includes('google.com') || host.includes('googleusercontent.com') ||
      xForwardedHost.includes('run.app') || xForwardedHost.includes('aistudio.google') || xForwardedHost.includes('google.com') ||
      referer.includes('run.app') || referer.includes('aistudio.google') || referer.includes('google.com') ||
      origin.includes('run.app') || origin.includes('aistudio.google') || origin.includes('google.com') ||
      process.env.NODE_ENV !== 'production';
    
    if (isCloudPreview) {
      return next();
    }

    const ipToCheck = (req.headers['x-forwarded-for'] as string || req.ip || '').split(',')[0].trim();
    
    if (!isLocalNetworkIP(ipToCheck)) {
      console.warn(`[BLOCKED EXTERNAL ACCESS] Connection attempt blocked from external IP: ${ipToCheck}`);
      return res.status(403).send(
        `<div style="font-family: sans-serif; padding: 2rem; max-width: 600px; margin: 4rem auto; background: #FFF4F4; border: 1px solid #F5C2C2; border-radius: 12px; color: #721C24; line-height: 1.6;">
          <h2 style="margin-top: 0; font-family: serif; font-size: 1.5rem; color: #9B1C1C;">🛡️ Accès Restreint (Réseau Local Uniquement)</h2>
          <p>La sécurité de votre application est activée : l'accès est restreint aux <strong>membres de votre réseau local (LAN, Wi-Fi privé de la maison)</strong>.</p>
          <p>Aucune connexion provenant d'internet n'est tolérée sur cette instance.</p>
          <hr style="border: 0; border-top: 1px solid #F5C2C2; margin: 1.5rem 0;" />
          <p style="font-size: 0.85rem; color: #6B7280; font-family: monospace;">IP détectée : ${ipToCheck}</p>
        </div>`
      );
    }
  }
  next();
});

// --- API ROUTES ---

// Get Database State
app.get('/api/db', (req, res) => {
  res.json(readDB());
});

// Save ingredients (Replace full list or update)
app.post('/api/db/ingredients', (req, res) => {
  const db = readDB();
  const newItem = req.body;
  
  if (!newItem.id) {
    newItem.id = 'ing_' + Math.random().toString(36).substr(2, 9);
  }
  
  const index = db.ingredients.findIndex(i => i.id === newItem.id);
  if (index !== -1) {
    db.ingredients[index] = newItem;
  } else {
    db.ingredients.push(newItem);
  }
  
  writeDB(db);
  res.json({ success: true, item: newItem, ingredients: db.ingredients });
});

// Delete stock ingredient
app.delete('/api/db/ingredients/:id', (req, res) => {
  const db = readDB();
  const index = db.ingredients.findIndex(i => i.id === req.params.id);
  
  if (index !== -1) {
    const deleted = db.ingredients.splice(index, 1);
    writeDB(db);
    res.json({ success: true, deleted });
  } else {
    res.status(404).json({ error: 'Ingredient not found' });
  }
});

// Clear all stock ingredients
app.post('/api/db/ingredients/clear', (req, res) => {
  const db = readDB();
  db.ingredients = [];
  writeDB(db);
  res.json({ success: true, ingredients: [] });
});

// Reset stock ingredients to defaults
app.post('/api/db/ingredients/reset', (req, res) => {
  const db = readDB();
  db.ingredients = JSON.parse(JSON.stringify(DEFAULT_STATE.ingredients));
  writeDB(db);
  res.json({ success: true, ingredients: db.ingredients });
});

// Add Recipe
app.post('/api/db/recipes', (req, res) => {
  const db = readDB();
  const newRecipe = req.body;
  
  if (!newRecipe.id) {
    newRecipe.id = 'rec_' + Math.random().toString(36).substr(2, 9);
  }
  newRecipe.portions = 4; // Always lock to 4 people per instructions

  const index = db.recipes.findIndex(r => r.id === newRecipe.id);
  if (index !== -1) {
    db.recipes[index] = newRecipe;
  } else {
    db.recipes.push(newRecipe);
  }
  
  writeDB(db);
  res.json({ success: true, recipe: newRecipe, recipes: db.recipes });
});

// Update Recipe Ratings
app.post('/api/db/recipes/:id/rate', (req, res) => {
  const db = readDB();
  const { id } = req.params;
  const { ratingTaste, ratingEase } = req.body;
  
  const recipe = db.recipes.find(r => r.id === id);
  if (recipe) {
    if (ratingTaste !== undefined) recipe.ratingTaste = ratingTaste;
    if (ratingEase !== undefined) recipe.ratingEase = ratingEase;
    writeDB(db);
    res.json({ success: true, recipe });
  } else {
    res.status(404).json({ error: 'Recipe not found' });
  }
});

// Delete Recipe
app.delete('/api/db/recipes/:id', (req, res) => {
  const db = readDB();
  const { id } = req.params;
  
  const index = db.recipes.findIndex(r => r.id === id);
  if (index !== -1) {
    const deleted = db.recipes.splice(index, 1);
    // Remove if it was selected too
    db.selectedRecipeIds = db.selectedRecipeIds.filter(rid => rid !== id);
    writeDB(db);
    res.json({ success: true, deleted });
  } else {
    res.status(404).json({ error: 'Recipe not found' });
  }
});

// Set selected recipe IDs
app.post('/api/db/selected-recipes', (req, res) => {
  const db = readDB();
  const { selectedRecipeIds } = req.body;
  
  if (Array.isArray(selectedRecipeIds)) {
    db.selectedRecipeIds = selectedRecipeIds;
    writeDB(db);
    res.json({ success: true, selectedRecipeIds: db.selectedRecipeIds });
  } else {
    res.status(400).json({ error: 'selectedRecipeIds must be an array' });
  }
});

// Add or update manual shopping items
app.post('/api/db/manual-shopping', (req, res) => {
  const db = readDB();
  const newItem = req.body;
  
  if (!newItem.id) {
    newItem.id = 'sh_' + Math.random().toString(36).substr(2, 9);
  }
  if (newItem.completed === undefined) newItem.completed = false;

  const index = db.manualShoppingItems.findIndex(i => i.id === newItem.id);
  if (index !== -1) {
    db.manualShoppingItems[index] = newItem;
  } else {
    db.manualShoppingItems.push(newItem);
  }
  
  writeDB(db);
  res.json({ success: true, item: newItem, manualShoppingItems: db.manualShoppingItems });
});

// Toggle/delete manual shopping items
app.delete('/api/db/manual-shopping/:id', (req, res) => {
  const db = readDB();
  const { id } = req.params;
  
  const index = db.manualShoppingItems.findIndex(i => i.id === id);
  if (index !== -1) {
    const deleted = db.manualShoppingItems.splice(index, 1);
    writeDB(db);
    res.json({ success: true, deleted, manualShoppingItems: db.manualShoppingItems });
  } else {
    res.status(404).json({ error: 'Shopping item not found' });
  }
});

// Toggle all manual shopping items
app.post('/api/db/manual-shopping/clear-completed', (req, res) => {
  const db = readDB();
  db.manualShoppingItems = db.manualShoppingItems.filter(item => !item.completed);
  writeDB(db);
  res.json({ success: true, manualShoppingItems: db.manualShoppingItems });
});

// --- GEMINI AI SERVICES ---

// AI Recipes Suggestions using Stock & Custom query
app.post('/api/ai/suggest', async (req, res) => {
  const { mode, customPrompt } = req.body;
  const db = readDB();
  
  // Format current stock to help Gemini
  const stockStr = db.ingredients
    .filter(i => i.quantity > 0)
    .map(i => `- ${i.name}: ${i.quantity} ${i.unit}`)
    .join('\n');

  let prompt = '';
  if (mode === 'exact-stock') {
    prompt = `Propose 3 recettes simples et détaillées qui utilisent PRINCIPALEMENT les ingrédients actuellement en stock chez moi.
Voici mon stock d'ingrédients actuel :
${stockStr}

IMPORTANT : 
- Toutes les recettes doivent être prévues pour exactement 4 personnes.
- S'il manque quelques petits ingrédients de base (sel, huile, vinaigre, oignon, etc.) indispensables, tu peux les inclure mais précise-les bien.
- Pour chaque ingrédient de la recette proposée, donne les quantités exactes pour 4 personnes.`;
  } else {
    prompt = `Propose 3 recettes créatives et savoureuses adaptées à ma demande. 
Demande de l'utilisateur : "${customPrompt || 'Idées de repas simples et de saison'}"

Voici également mon stock d'ingrédients actuel (que tu peux utiliser s'ils correspondent) :
${stockStr}

IMPORTANT : 
- Toutes les recettes doivent être prévues pour exactement 4 personnes.
- Donne de superbes recettes équilibrées.
- Pour chaque ingrédient de la recette proposée, donne les quantités exactes pour 4 personnes. Précise un motif de correspondance pourquoi cette recette plaît à l'utilisateur.`;
  }

  try {
    const ai = getGeminiClient();
    if (!process.env.GEMINI_API_KEY) {
      return res.status(400).json({ 
        error: "La clé API Gemini n'est pas configurée dans les secrets de l'application. Veuillez configurer GEMINI_API_KEY." 
      });
    }

    const response = await generateContentWithRetry(ai, {
      model: process.env.GEMINI_MODEL || 'gemini-flash-latest',
      contents: prompt,
      config: {
        systemInstruction: "Tu es un chef cuisinier professionnel étoilé français, expert en optimisation de stock, zéro gâchis et organisation de listes de courses. Tu réponds exclusivement en format JSON structuré selon le schéma fourni. Les ingrédients doivent avoir des quantités précises pour 4 personnes.",
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Nom de la recette suggérée" },
              matchingReason: { type: Type.STRING, description: "Pourquoi cette recette correspond (ex: utilise les courgettes du stock ou répond au souhait de l'utilisateur)" },
              instructions: { type: Type.STRING, description: "Instructions détaillées de préparation étape par étape, rédigées de façon claire et numérotée" },
              ingredients: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: "Nom de l'ingrédient de cuisine" },
                    quantity: { type: Type.NUMBER, description: "Quantité nette nécessaire pour 4 personnes" },
                    unit: { type: Type.STRING, description: "Unité courte de l'ingrédient (g, ml, pièce, cuillère, pincée, etc.)" }
                  },
                  required: ["name", "quantity", "unit"]
                }
              }
            },
            required: ["name", "matchingReason", "instructions", "ingredients"]
          }
        }
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("No text response received from Gemini.");
    }
    const suggestions = JSON.parse(text.trim());
    res.json({ success: true, suggestions });
  } catch (error: any) {
    console.error('Gemini Suggestion Error:', error);
    res.status(500).json({ error: error.message || "Erreur lors de la génération d'idées de recettes." });
  }
});

// AI Parse Book Recipe from raw text files
app.post('/api/ai/parse-book-recipe', async (req, res) => {
  const { text, bookRef } = req.body;
  
  if (!text || text.trim() === '') {
    return res.status(400).json({ error: 'Le texte de la recette est requis.' });
  }

  const prompt = `Analyse cette recette de cuisine issue de mon livre de cuisine et formate-la de manière rigoureuse en un objet JSON structuré.
Référence du livre fournie : "${bookRef || 'Livre de cuisine personnel'}"

Texte brut de la recette :
"""
${text}
"""

IMPORTANT :
- Tu dois impérativement adapter ou recalculer les proportions des ingrédients pour EXACTEMENT 4 personnes !
- Toutes les quantités d'ingrédients doivent être converties en valeurs numériques simples.
- Rédige des instructions claires, structurées en étapes numérotées.
- Renvoie uniquement l'objet JSON.`;

  try {
    const ai = getGeminiClient();
    if (!process.env.GEMINI_API_KEY) {
      return res.status(400).json({ 
        error: "La clé API Gemini n'est pas configurée dans les secrets de l'application. Veuillez configurer GEMINI_API_KEY." 
      });
    }

    const response = await generateContentWithRetry(ai, {
      model: process.env.GEMINI_MODEL || 'gemini-flash-latest',
      contents: prompt,
      config: {
        systemInstruction: "Tu es un assistant de cuisine spécialisé dans l'analyse de livres de cuisine bruts. Tu extrais les données et recalcules STRICTEMENT toutes les proportions d'ingrédients pour un repas de 4 personnes. Tu réponds au format JSON selon le schéma demandé.",
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Nom de la recette extrait du texte" },
            instructions: { type: Type.STRING, description: "Instructions complètes étape par étape pour préparer la recette" },
            ingredients: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Nom exact de l'ingrédient" },
                  quantity: { type: Type.NUMBER, description: "Quantité requise ajustée spécifiquement pour 4 personnes" },
                  unit: { type: Type.STRING, description: "Unité standard : g, ml, pièce, cuillère, pincée, etc." }
                },
                required: ["name", "quantity", "unit"]
              }
            }
          },
          required: ["name", "instructions", "ingredients"]
        }
      }
    });

    const resText = response.text;
    if (!resText) {
      throw new Error("No text response received from Gemini parser.");
    }
    const parsedRecipe = JSON.parse(resText.trim());
    
    // Add additional metadata values on backend
    const completedRecipe: Recipe = {
      id: 'rec_' + Math.random().toString(36).substr(2, 9),
      name: parsedRecipe.name || 'Recette Importée',
      instructions: parsedRecipe.instructions,
      ingredients: parsedRecipe.ingredients,
      portions: 4,
      bookRef: bookRef || 'Livre personnel',
      isCustom: true
    };
    
    res.json({ success: true, recipe: completedRecipe });
  } catch (error: any) {
    console.error('Gemini Parser Error:', error);
    res.status(500).json({ error: error.message || "Impossible de décoder la recette brute." });
  }
});


// Helper to categorize ingredients on-the-fly dynamically
app.post('/api/ai/categorize-ingredient', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Nom d'ingrédient requis" });
  
  const prompt = `Détermine le rayon de supermarché / magasin de proximité le plus adapté pour cet ingrédient : "${name}".
Les choix possibles de rayons sont :
- "Marché" (pour fruits et légumes frais)
- "Boucher" (pour toutes les viandes, jambon, volailles)
- "Fromager" (pour les fromages de toutes sortes, les œufs, le beurre frais artisanal)
- "Supermarché" (pour la crème fraîche industrielle, le lait, le riz, les pâtes, l'épicerie sèche, le sel, le poivre, l'huile de cuisine, les conserves, et tout autre produit)

Renvoie uniquement le mot choisi parmi : Marché, Boucher, Fromager, Supermarché.`;

  try {
    const ai = getGeminiClient();
    if (!process.env.GEMINI_API_KEY) {
      // Fallback
      return res.json({ category: "Supermarché" });
    }
    const response = await generateContentWithRetry(ai, {
      model: process.env.GEMINI_MODEL || 'gemini-flash-latest',
      contents: prompt,
      config: {
        maxOutputTokens: 20,
        temperature: 0.1
      }
    });
    
    const ans = (response.text || "Supermarché").trim();
    let finalCat: 'Marché' | 'Boucher' | 'Fromager' | 'Supermarché' = 'Supermarché';
    if (ans.includes("Marché") || ans.includes("Marché".toLowerCase())) finalCat = "Marché";
    else if (ans.includes("Boucher")) finalCat = "Boucher";
    else if (ans.includes("Fromager")) finalCat = "Fromager";
    
    res.json({ category: finalCat });
  } catch (err) {
    res.json({ category: "Supermarché" });
  }
});


// Category detection helper for stock management
function inferCategoryFromName(name: string): 'Marché' | 'Boucher' | 'Fromager' | 'Supermarché' {
  const n = (name || '').toLowerCase();
  if (/boeuf|bœuf|poulet|porc|viande|dinde|canard|lardon|jambon|saucisse|bacon|steak|veau|poisson|saumon|cabillaud|crevette|thon|truite|agneau|volaille|moule|crustac|canette|lapin|gibier/.test(n)) {
    return 'Boucher';
  }
  if (/fromage|gruyere|gruyère|parmesan|comté|comte|mozzarella|beurre|oeuf|œuf|lait|yaourt|chèvre|chevre|creme|crème|ricotta|feta|emmental|roquefort|mascarpone/.test(n)) {
    return 'Fromager';
  }
  if (/pomme|poire|fraise|carotte|courgette|tomate|salade|oignon|echalote|échalote|ail|poireau|chou|champignon|haricot|epinard|épinard|citron|concombre|avocat|persil|basilic|menthe|herbe|légume|legume|fruit|banane|orange|peche|pêche|abricot|raisin|poivron|aubergine|brocoli|radis|panais|navet|céleri|potiron|courge|butternut/.test(n)) {
    return 'Marché';
  }
  return 'Supermarché';
}

const stockTools = [{
  functionDeclarations: [
    {
      name: 'emptyStock',
      description: 'Vide complètement tout le stock d\'ingrédients de cuisine de l\'utilisateur (supprime tous les articles du stock). À appeler quand l\'utilisateur demande de vider son stock, tout effacer, faire place nette, remettre le stock à zéro, etc.',
      parameters: {
        type: Type.OBJECT,
        properties: {}
      }
    },
    {
      name: 'addStockItems',
      description: 'Ajoute un ou plusieurs ingrédients dans le stock de cuisine de l\'utilisateur ou incrémente les quantités des ingrédients déjà présents. Ex: "ajoute 6 oeufs et 1kg de carottes", "j\'ai acheté 200g de gruyère", "mets 2 briques de lait".',
      parameters: {
        type: Type.OBJECT,
        properties: {
          items: {
            type: Type.ARRAY,
            description: 'Liste des ingrédients à ajouter ou réapprovisionner dans le stock.',
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: 'Nom de l\'ingrédient (ex: Carottes, Farine, Œufs)' },
                quantity: { type: Type.NUMBER, description: 'Quantité numérique (ex: 6, 250, 1)' },
                unit: { type: Type.STRING, description: 'Unité de mesure (ex: pièces, g, kg, ml, l, cl, tranches)' },
                category: {
                  type: Type.STRING,
                  enum: ['Marché', 'Boucher', 'Fromager', 'Supermarché'],
                  description: 'Rayon où ranger l\'ingrédient'
                }
              },
              required: ['name', 'quantity']
            }
          }
        },
        required: ['items']
      }
    },
    {
      name: 'removeStockItems',
      description: 'Supprime un ou plusieurs ingrédients spécifiques du stock. Ex: "supprime les tomates", "retire la crème fraîche", "je n\'ai plus de gruyère".',
      parameters: {
        type: Type.OBJECT,
        properties: {
          names: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Noms des ingrédients à supprimer du stock'
          }
        },
        required: ['names']
      }
    },
    {
      name: 'updateStockItemQuantity',
      description: 'Met à jour la quantité d\'un ingrédient en stock : soit en déduisant une quantité consommée/utilisée (ex: "j\'ai utilisé 2 oeufs"), soit en fixant la nouvelle quantité restante (ex: "il ne me reste plus que 2 courgettes").',
      parameters: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Nom de l\'ingrédient' },
          quantity: { type: Type.NUMBER, description: 'Quantité numérique' },
          isDeduction: { type: Type.BOOLEAN, description: 'True si l\'utilisateur a consommé/utilisé/retiré cette quantité. False si c\'est la quantité totale restante en stock.' },
          unit: { type: Type.STRING, description: 'Unité facultative' }
        },
        required: ['name', 'quantity']
      }
    },
    {
      name: 'resetStockToDefault',
      description: 'Réinitialise le stock aux ingrédients de départ par défaut de l\'application.',
      parameters: {
        type: Type.OBJECT,
        properties: {}
      }
    }
  ]
}];

// --- CHAT WITH RATATOUILLE ENDPOINT ---
app.post('/api/ai/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Historique des messages invalide ou absent" });
  }

  const db = readDB();
  const stockStr = db.ingredients
    .filter(i => i.quantity > 0)
    .map(i => `- ${i.name}: ${i.quantity} ${i.unit}`)
    .join('\n');

  const systemInstruction = `Tu es Ratatouille, le chef de cuisine virtuel drôle, chaleureux, passionné et expert de l'application de cuisine "Ma cuisine à moi".
Tu adores conseiller l'utilisateur sur ce qu'il peut cuisiner en privilégiant les produits locaux, frais et de saison.

Voici le stock actuel de l'utilisateur (que tu peux mentionner ou modifier) :
${stockStr || "Le stock est actuellement vide."}

Consignes de comportement :
1. Adopte une personnalité chaleureuse de chef cuisinier français passionné : utilise des mots comme "Magnifique !", "Oh la la !", "Chef !", "Bon appétit !". Mais reste toujours d'une aide précieuse, bienveillant, et propose des recettes claires et précises.
2. GESTION ACTIVE DU STOCK : Tu as le super-pouvoir d'effectuer des actions directement sur le stock de l'utilisateur grâce à tes outils intégrés !
   - Si l'utilisateur te demande de vider son stock ("vide mon stock", "vide tout", "efface le stock", "fais place nette"), utilise l'outil \`emptyStock\`.
   - S'il te dit ce qu'il a acheté ou reçu ("ajoute 6 oeufs", "j'ai acheté 500g de fraises", "mets 2 briques de lait"), utilise l'outil \`addStockItems\`.
   - S'il a terminé ou veut retirer un ingrédient ("retire les tomates", "supprime la crème"), utilise \`removeStockItems\`.
   - S'il a utilisé une portion ou s'il lui en reste une quantité précise ("j'ai utilisé 2 oeufs", "il me reste 3 carottes"), utilise \`updateStockItemQuantity\`.
   - S'il veut rétablir le stock d'exemple, utilise \`resetStockToDefault\`.
3. Si l'utilisateur te demande des idées de recettes à partir d'ingrédients ou une recette précise, donne-lui une recette claire avec :
   - Un titre accrocheur à la française (Exemple: # Poulet à la Crème de Saison)
   - Le temps de préparation et de cuisson
   - Une liste d'ingrédients claire pour 4 personnes sous "## Ingrédients"
   - Des étapes pas-à-pas bien numérotées sous "## Instructions".
4. Rappelle occasionnellement que ses recettes sont conservées sous forme de fichiers .json indépendants dans le dossier physique "recipes/".
5. Rends tes réponses visuellement magnifiques en utilisant du Markdown (gras, listes à puces, retours à la ligne, émojis culinaires).
6. Réponds toujours en français.`;

  let stockChanged = false;
  const executedActions: Array<{ type: string; summary: string }> = [];

  // Direct fast heuristic detection for common explicit clear stock requests
  const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user');
  const lastText = (lastUserMsg?.text || '').trim().toLowerCase();
  const isDirectClear = /^(vide|vider|efface|effacer|supprime|supprimer)\s+(mon\s+|le\s+|tout\s+le\s+)?stock(\s+s['']il\s+te\s+pla[iî]t)?$/i.test(lastText) ||
    /^(vide|efface)\s+tout(\s+s['']il\s+te\s+pla[iî]t)?$/i.test(lastText) ||
    /^(remets?|remettre)\s+(le\s+|mon\s+)?stock\s+[aà]\s+z[eé]ro$/i.test(lastText);

  if (isDirectClear) {
    db.ingredients = [];
    writeDB(db);
    stockChanged = true;
    executedActions.push({ type: 'empty_stock', summary: 'Stock entièrement vidé (0 ingrédient)' });
  }

  try {
    const ai = getGeminiClient();
    if (!process.env.GEMINI_API_KEY) {
      if (stockChanged) {
        return res.json({
          text: `*Et voilà Chef !* 🧑‍🍳✨\n\nJ'ai bien vidé tout votre stock d'ingrédients. Vos placards sont désormais complètement vides et prêts pour de nouvelles emplettes !\n\n*(Note : Configurez votre clé GEMINI_API_KEY pour débloquer les dialogues avancés).*`,
          stockUpdated: true,
          updatedIngredients: db.ingredients,
          actionsExecuted: executedActions
        });
      }
      return res.json({ 
        text: `*Oh la la !* Mon cher Chef, la clé API Gemini n'est pas encore configurée dans vos secrets d'application ! 🧑‍🍳🥖
        
Pour pouvoir tailler une bavette ensemble et gérer vos stocks par la voix, s'il vous plaît :
1. Ouvrez le fichier \`.env\` ou le panneau **Settings > Secrets**
2. Ajoutez la variable d'environnement \`GEMINI_API_KEY\` avec votre clé valide.

En attendant, je prépare mes cuillères et j'affûte mes couteaux dans ma petite cuisine ! *Bon appétit !*`,
        stockUpdated: false,
        updatedIngredients: db.ingredients
      });
    }

    // Map incoming message format to Gemini's format: { role: 'user' | 'model', parts: [{ text: string }] }
    const contents = messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : m.role,
      parts: [{ text: m.text }]
    }));

    const response = await generateContentWithRetry(ai, {
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        tools: stockTools,
        temperature: 0.7,
      }
    });

    let text = response.text || "";

    // Check if Gemini invoked function calls
    if (response.functionCalls && response.functionCalls.length > 0) {
      for (const call of response.functionCalls) {
        if (call.name === 'emptyStock') {
          if (!isDirectClear) {
            db.ingredients = [];
            stockChanged = true;
            executedActions.push({ type: 'empty_stock', summary: 'Stock entièrement vidé (0 ingrédient)' });
          }
        } else if (call.name === 'addStockItems') {
          const items = (call.args as any)?.items || [];
          const addedSummaries: string[] = [];
          for (const item of items) {
            if (!item.name) continue;
            const cleanName = item.name.trim();
            const existing = db.ingredients.find(i => i.name.toLowerCase() === cleanName.toLowerCase());
            const qty = Number(item.quantity) || 1;
            const unit = item.unit || 'pièces';
            if (existing) {
              existing.quantity = parseFloat((existing.quantity + qty).toFixed(1));
              if (item.unit) existing.unit = item.unit;
              addedSummaries.push(`+${qty} ${existing.unit} ${existing.name}`);
            } else {
              const capitalized = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
              const cat = (item.category as any) || inferCategoryFromName(cleanName);
              db.ingredients.push({
                id: 'ing_' + Math.random().toString(36).substr(2, 9),
                name: capitalized,
                quantity: parseFloat(qty.toFixed(1)),
                unit: unit,
                category: cat
              });
              addedSummaries.push(`+${qty} ${unit} ${capitalized}`);
            }
          }
          if (addedSummaries.length > 0) {
            stockChanged = true;
            executedActions.push({ type: 'add_stock', summary: `Ajouté au stock : ${addedSummaries.join(', ')}` });
          }
        } else if (call.name === 'removeStockItems') {
          const names = (call.args as any)?.names || [];
          const removed: string[] = [];
          for (const n of names) {
            const clean = (n || '').toLowerCase().trim();
            const matching = db.ingredients.filter(i => 
              i.name.toLowerCase() === clean || 
              i.name.toLowerCase().includes(clean) || 
              clean.includes(i.name.toLowerCase())
            );
            if (matching.length > 0) {
              matching.forEach(m => removed.push(m.name));
              db.ingredients = db.ingredients.filter(i => !matching.some(m => m.id === i.id));
            }
          }
          if (removed.length > 0) {
            stockChanged = true;
            executedActions.push({ type: 'remove_stock', summary: `Retiré du stock : ${removed.join(', ')}` });
          }
        } else if (call.name === 'updateStockItemQuantity') {
          const { name, quantity, isDeduction } = (call.args as any) || {};
          const clean = (name || '').toLowerCase().trim();
          const existing = db.ingredients.find(i => 
            i.name.toLowerCase() === clean || 
            i.name.toLowerCase().includes(clean) || 
            clean.includes(i.name.toLowerCase())
          );
          const qty = Number(quantity) || 0;
          if (existing) {
            if (isDeduction) {
              existing.quantity = Math.max(0, parseFloat((existing.quantity - qty).toFixed(1)));
              stockChanged = true;
              executedActions.push({ 
                type: 'update_stock', 
                summary: `Consommé : -${qty} ${existing.unit} de ${existing.name} (Reste : ${existing.quantity} ${existing.unit})` 
              });
            } else {
              existing.quantity = Math.max(0, parseFloat(qty.toFixed(1)));
              stockChanged = true;
              executedActions.push({ 
                type: 'update_stock', 
                summary: `Quantité mise à jour : ${existing.name} = ${existing.quantity} ${existing.unit}` 
              });
            }
          }
        } else if (call.name === 'resetStockToDefault') {
          db.ingredients = JSON.parse(JSON.stringify(DEFAULT_STATE.ingredients));
          stockChanged = true;
          executedActions.push({ type: 'reset_stock', summary: 'Stock réinitialisé aux ingrédients par défaut' });
        }
      }

      if (stockChanged) {
        writeDB(db);
      }

      // Query Gemini with tool outputs so Ratatouille can confirm conversationally
      try {
        const candidateContent = response.candidates?.[0]?.content;
        const toolParts = response.functionCalls.map((fc: any) => ({
          functionResponse: {
            name: fc.name,
            response: {
              success: true,
              executedActions: executedActions.map(a => a.summary),
              currentStockCount: db.ingredients.length,
              currentStockOverview: db.ingredients.slice(0, 10).map(i => `${i.name} (${i.quantity} ${i.unit})`).join(', ')
            }
          }
        }));

        if (candidateContent) {
          const followUp = await generateContentWithRetry(ai, {
            model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
            contents: [
              ...contents,
              candidateContent,
              {
                role: 'tool',
                parts: toolParts
              }
            ],
            config: {
              systemInstruction: systemInstruction,
              temperature: 0.7
            }
          });

          if (followUp && followUp.text) {
            text = followUp.text;
          }
        }
      } catch (followUpErr) {
        console.warn('Follow-up tool response failed, fallback to direct text:', followUpErr);
        if (!text) {
          text = `*Et voilà Chef ! Vos ordres sont exécutés en cuisine !* 🧑‍🍳✨\n\n` +
            executedActions.map(a => `• **${a.summary}**`).join('\n') +
            `\n\n*Vos placards et votre réfrigérateur sont à jour. Que mijotons-nous de beau ?*`;
        }
      }
    }

    // If direct clear stock was triggered and model gave generic text or empty text
    if (isDirectClear && (!text || text.includes("Désolé Chef"))) {
      text = `*Et voilà Chef ! J'ai vidé tout votre stock avec entrain !* 🧑‍🍳✨\n\nLe plan de travail est étincelant et vos placards sont vides, prêts pour vos prochaines trouvailles au marché !\n\n*Dites-moi dès que vous avez de nouveaux ingrédients ou une envie de recette !*`;
    }

    if (!text) {
      text = "Désolé Chef, je n'ai pas pu concevoir d'idées. Peux-tu reformuler ?";
    }

    res.json({
      text,
      stockUpdated: stockChanged,
      updatedIngredients: db.ingredients,
      actionsExecuted: executedActions
    });
  } catch (err: any) {
    console.error('Ratatouille Chat Error:', err);
    // If stock changed prior to error, we still report it
    if (stockChanged) {
      return res.json({
        text: `*C'est noté Chef !* L'action sur votre stock a bien été effectuée dans vos placards : \n\n` +
          executedActions.map(a => `• ${a.summary}`).join('\n') + 
          `\n\n*(Une petite interruption de réseau avec le commis s'est produite pour le message vocal, mais vos stocks sont impeccablement mis à jour !)*`,
        stockUpdated: true,
        updatedIngredients: db.ingredients,
        actionsExecuted: executedActions
      });
    }
    res.status(500).json({ error: err.message || "Erreur interne de communication avec Ratatouille." });
  }
});


// Serve Vite or static assets depending on environment
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Since this is custom server with React SPA, return index.html for all other paths
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server started on http://0.0.0.0:${PORT}`);
  });
}

startServer();
