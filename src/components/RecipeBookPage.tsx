import React, { useState, useRef } from 'react';
import { 
  Sparkles, Star, Upload, Plus, Trash2, Play, 
  BookOpen, Search, Book, Users, Loader2, ArrowRight, Check
} from 'lucide-react';
import { Recipe, Ingredient, RecipeIngredient } from '../types';

// Standardized structure templates for saving and sharing custom recipes
const STANDARD_JSON_TEMPLATE = `{
  "name": "Poulet à la Crème de Saison",
  "portions": 4,
  "bookRef": "Ma cuisine à moi - Édition Printemps",
  "ratingTaste": 5,
  "ratingEase": 4,
  "ingredients": [
    { "name": "Émincé de poulet", "quantity": 500, "unit": "g" },
    { "name": "Crème fraîche épaisse", "quantity": 250, "unit": "ml" },
    { "name": "Champignons frais", "quantity": 200, "unit": "g" }
  ],
  "instructions": "1. Faire revenir les champignons émincés dans une poêle de beurre chaud.\\n2. Saisir séparément les émincés de poulet.\\n3. Réunir le poulet et les champignons, saler, poivrer, puis verser la crème entière.\\n4. Laisser mijoter 5 minutes à feu très doux et servir avec du riz basmati."
}`;

const STANDARD_MD_TEMPLATE = `# Poulet à la Crème de Saison

- **Référence** : Ma cuisine à moi - Édition Printemps
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

interface RecipeBookPageProps {
  recipes: Recipe[];
  stockIngredients: Ingredient[];
  selectedRecipeIds: string[];
  onSelectRecipe: (id: string, selected: boolean) => void;
  onAddRecipe: (recipe: Recipe) => void;
  onDeleteRecipe: (id: string) => void;
  onUpdateRating: (id: string, taste: number, ease: number) => void;
  onPrepareRecipe: (recipe: Recipe) => void;
}

export default function RecipeBookPage({
  recipes,
  stockIngredients,
  selectedRecipeIds,
  onSelectRecipe,
  onAddRecipe,
  onDeleteRecipe,
  onUpdateRating,
  onPrepareRecipe
}: RecipeBookPageProps) {
  // AI suggestions state
  const [aiMode, setAiMode] = useState<'exact-stock' | 'custom'>('exact-stock');
  const [customAiPrompt, setCustomAiPrompt] = useState('');
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);

  // Manual import state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importedText, setImportedText] = useState('');
  const [bookRef, setBookRef] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<'import' | 'templates'>('import');
  const [copiedType, setCopiedType] = useState<'json' | 'md' | null>(null);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTheme, setSelectedTheme] = useState<string>('Tous');
  const [selectedMeat, setSelectedMeat] = useState<string>('Tous');

  // File Upload Reference for raw files
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Trigger AI recipe suggestion
  const handleGenerateAiSuggestions = async () => {
    setIsLoadingAi(true);
    setAiError(null);
    setAiSuggestions([]);
    try {
      const response = await fetch('/api/ai/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: aiMode,
          customPrompt: aiMode === 'custom' ? customAiPrompt : ''
        })
      });

      if (!response.ok) {
        let errMsg = 'Une erreur est survenue lors de la suggestion';
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errMsg = errorData.error || errMsg;
          }
        } catch (e) {}
        throw new Error(errMsg);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Réponse du serveur non conforme (format attendu : JSON).');
      }

      const data = await response.json();
      setAiSuggestions(data.suggestions || []);
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || 'Impossible de se connecter au serveur IA.');
    } finally {
      setIsLoadingAi(false);
    }
  };

  // Import raw recipe via text upload or copy paste
  const handleParseRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importedText.trim()) return;

    setIsParsing(true);
    setParseError(null);
    try {
      const response = await fetch('/api/ai/parse-book-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: importedText,
          bookRef: bookRef
        })
      });

      if (!response.ok) {
        let errMsg = 'Erreur lors de la lecture de la recette';
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errMsg = errorData.error || errMsg;
          }
        } catch (e) {}
        throw new Error(errMsg);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Réponse du serveur non conforme (format attendu : JSON).');
      }

      const data = await response.json();
      onAddRecipe(data.recipe);
      setImportedText('');
      setBookRef('');
      setIsImportModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setParseError(err.message || "Erreur de décodage par l'IA. Vérifiez votre texte.");
    } finally {
      setIsParsing(false);
    }
  };

  // Handle file selection and read as text (or parse JSON directly)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      
      if (file.name.endsWith('.json')) {
        try {
          const parsed = JSON.parse(text);
          if (parsed && parsed.name) {
            // It matches our schema! Make sure isCustom is true, portions in 4
            const newRecipe: Recipe = {
              id: parsed.id || 'rec_' + Math.random().toString(36).substr(2, 9),
              name: parsed.name,
              instructions: parsed.instructions || '',
              ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
              portions: parsed.portions || 4,
              bookRef: parsed.bookRef || `Import standard - ${file.name.replace('.json', '')}`,
              ratingTaste: parsed.ratingTaste || 5,
              ratingEase: parsed.ratingEase || 4,
              isCustom: true
            };
            onAddRecipe(newRecipe);
            setIsImportModalOpen(false);
            setImportedText('');
            setBookRef('');
            return;
          } else {
            setParseError("Le fichier JSON n'est pas conforme à notre modèle de recette standardisé (propriété 'name' absente).");
          }
        } catch (err) {
          setParseError("Impossible de lire ce fichier JSON. Assurez-vous qu'il est correctement formaté.");
        }
      } else {
        // Fallback for raw book TXT or MD files (send to Gemini parser textarea)
        setImportedText(text);
        // Auto-extract a potential book reference from filename
        const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
        setBookRef(prev => prev || `Livre: ${cleanName}`);
      }
    };
    reader.readAsText(file);
  };

  // Add an AI suggested recipe to saved recipes book
  const handleSaveSuggestedRecipe = (suggested: any) => {
    const newRecipe: Recipe = {
      id: 'rec_' + Math.random().toString(36).substr(2, 9),
      name: suggested.name,
      instructions: suggested.instructions,
      ingredients: suggested.ingredients,
      portions: 4,
      bookRef: aiMode === 'exact-stock' ? 'Générée d\'après Stock' : 'Générée d\'après Souhait',
      isCustom: true
    };
    onAddRecipe(newRecipe);
    // Remove from temporary suggestions
    setAiSuggestions(prev => prev.filter(r => r.name !== suggested.name));
  };

  // Dynamic classification matching helpers
  const checkThemeMatch = (recipe: Recipe, theme: string): boolean => {
    if (theme === 'Tous') return true;
    const nameLower = recipe.name.toLowerCase();
    const instructionsLower = (recipe.instructions || '').toLowerCase();
    const ingredientsStr = recipe.ingredients.map(i => i.name.toLowerCase()).join(' ');
    
    if (theme === 'Végétarien') {
      const meatKeywords = ["poulet", "boeuf", "bœuf", "porc", "veau", "dinde", "lard", "canard", "jambon", "crevette", "saumon", "poisson", "cabillaud", "agneau", "viande", "thon", "steak", "chorizo", "saucisse", "bacon", "volaille", "coq", "crustacé", "moule"];
      return !meatKeywords.some(kw => nameLower.includes(kw) || ingredientsStr.includes(kw));
    }
    if (theme === 'Dessert') {
      const dessertKeywords = ["dessert", "chocolat", "gâteau", "gateau", "tarte", "sucré", "sucre", "fruits", "crêpe", "crepe", "pomme", "creme", "glace", "caramel", "fraise", "abricot", "poire", "muffin", "biscuit", "cookie"];
      return dessertKeywords.some(kw => nameLower.includes(kw));
    }
    if (theme === 'Entrée') {
      const entreeKeywords = ["entrée", "entree", "salade", "soupe", "velouté", "veloute", "quiche", "tartine", "bruschetta", "gaspacho", "charcuterie"];
      return entreeKeywords.some(kw => nameLower.includes(kw));
    }
    if (theme === 'Plat principal') {
      const dessertKeywords = ["dessert", "chocolat", "gâteau", "gateau", "tarte", "sucré", "sucre", "crêpe", "crepe", "glace", "muffin", "biscuit"];
      const isDessert = dessertKeywords.some(kw => nameLower.includes(kw));
      const entreeKeywords = ["entrée", "entree", "salade", "soupe", "velouté", "veloute", "tartine", "bruschetta"];
      const isEntree = entreeKeywords.some(kw => nameLower.includes(kw)) && !nameLower.includes("plat");
      return !isDessert && !isEntree;
    }
    if (theme === 'Réconfortant') {
      const comfortingKeywords = ["fromage", "crème", "creme", "pâte", "pate", "gratin", "tartiflette", "beurre", "raclette", "fondue", "sauce", "lasagne", "croque", "purée", "puree", "chocolat"];
      return comfortingKeywords.some(kw => nameLower.includes(kw) || ingredientsStr.includes(kw) || instructionsLower.includes(kw));
    }
    if (theme === 'Léger') {
      const lightKeywords = ["salade", "légumes", "legumes", "vapeur", "soupe", "velouté", "veloute", "courgette", "concombre", "tomate", "bouillon", "wok", "minceur", "diet", "épinard", "epinard"];
      return lightKeywords.some(kw => nameLower.includes(kw) || ingredientsStr.includes(kw));
    }
    return true;
  };

  const checkMeatMatch = (recipe: Recipe, meat: string): boolean => {
    if (meat === 'Tous') return true;
    const nameLower = recipe.name.toLowerCase();
    const ingredientsStr = recipe.ingredients.map(i => i.name.toLowerCase()).join(' ');
    const combined = nameLower + ' ' + ingredientsStr;
    
    if (meat === 'Volaille') {
      const keywords = ["poulet", "dinde", "canard", "volaille", "coq", "pintade", "poulette", "oie"];
      return keywords.some(kw => combined.includes(kw));
    }
    if (meat === 'Bœuf') {
      const keywords = ["boeuf", "bœuf", "steak", "haché", "hache", "veau", "génisse", "carpaccio", "ragoût", "ragout", "entrecôte", "entrecote"];
      return keywords.some(kw => combined.includes(kw));
    }
    if (meat === 'Porc') {
      const keywords = ["porc", "lard", "bacon", "jambon", "saucisse", "chorizo", "cochon", "pâté", "pate"];
      return keywords.some(kw => combined.includes(kw));
    }
    if (meat === 'Poisson/Crustacés') {
      const keywords = ["saumon", "thon", "cabillaud", "poisson", "crevette", "crustacé", "moule", "huître", "huitre", "truite", "sardine", "colin", "fruits de mer", "gambas"];
      return keywords.some(kw => combined.includes(kw));
    }
    if (meat === 'Sans viande') {
      const meatKeywords = ["poulet", "boeuf", "bœuf", "porc", "veau", "dinde", "lard", "canard", "jambon", "crevette", "saumon", "poisson", "cabillaud", "agneau", "viande", "thon", "steak", "chorizo", "saucisse", "bacon", "volaille", "coq", "crustacé", "moule"];
      return !meatKeywords.some(kw => combined.includes(kw));
    }
    return true;
  };

  // Filter recipes based on query, theme and meat type
  const filteredRecipes = recipes.filter(r => {
    const matchesSearch = searchQuery.trim() === '' ||
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.bookRef && r.bookRef.toLowerCase().includes(searchQuery.toLowerCase())) ||
      r.ingredients.some(ing => ing.name.toLowerCase().includes(searchQuery.toLowerCase()));
      
    if (!matchesSearch) return false;
    return checkThemeMatch(r, selectedTheme) && checkMeatMatch(r, selectedMeat);
  });

  // Math helper to check if we have enough stock for an ingredient
  const getIngredientStockStatus = (reqName: string, reqQty: number, reqUnit: string) => {
    // Try to find matching ingredient in stock
    const cleanReq = reqName.toLowerCase().trim();
    const stock = stockIngredients.find(s => s.name.toLowerCase().trim() === cleanReq);

    if (!stock) {
      return { status: 'missing', available: 0, missing: reqQty, unit: reqUnit };
    }

    // Standardize small units where possible
    if (stock.quantity >= reqQty) {
      return { status: 'enough', available: stock.quantity, missing: 0, unit: reqUnit };
    } else {
      return { status: 'partial', available: stock.quantity, missing: reqQty - stock.quantity, unit: reqUnit };
    }
  };

  return (
    <div className="space-y-8" id="recipe-page">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-natural-border pb-5">
        <div>
          <h1 className="text-3xl font-serif font-bold text-natural-sage" id="recipe-book-title">
            Cahier de Recettes
          </h1>
          <p className="text-sm text-natural-category mt-1">
            Recherchez des idées, planifiez vos repas pour 4 personnes et importez vos livres de cuisine.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button 
            id="btn-open-import"
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-natural-sage hover:bg-opacity-90 text-white rounded-xl text-sm font-semibold shadow-sm transition-all cursor-pointer animate-fade-in"
          >
            <Upload className="w-4 h-4" />
            Importer un livre (.txt)
          </button>
        </div>
      </div>

      {/* SEARCH AND FILTER RECIPES LIST */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT TWO COLS: SAVED RECIPES */}
        <div className="lg:col-span-2 space-y-6">
          {/* SEARCH & FILTERS PANEL */}
          <div className="bg-white rounded-2xl border border-natural-border p-5 space-y-4 shadow-3xs">
            {/* 1. Mots-clefs & Ingrédients */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-natural-sage uppercase tracking-wider block">
                Rechercher par mot-clé ou ingrédient
              </label>
              <div className="flex items-center justify-between gap-2 bg-[#FAF8F0] p-2 rounded-xl border border-natural-border">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-natural-category absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="recipe-search-input"
                    type="text"
                    placeholder="Ex: courgette, poulet, Hachette, printemps..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-1.5 bg-transparent text-natural-text text-xs focus:outline-none"
                  />
                </div>
                {(searchQuery || selectedTheme !== 'Tous' || selectedMeat !== 'Tous') && (
                  <button 
                    id="clear-search-btn"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedTheme('Tous');
                      setSelectedMeat('Tous');
                    }}
                    className="text-natural-category hover:text-rose-600 text-xs font-semibold px-2 transition-colors cursor-pointer"
                  >
                    Réinitialiser
                  </button>
                )}
              </div>
            </div>

            {/* 2. Thématique */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-natural-category uppercase tracking-wider block">
                Thématique / Catégorie de repas
              </label>
              <div className="flex flex-wrap gap-1">
                {['Tous', 'Entrée', 'Plat principal', 'Dessert', 'Végétarien', 'Réconfortant', 'Léger'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSelectedTheme(t)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                      selectedTheme === t
                        ? 'bg-natural-sage text-white border-natural-sage shadow-xs font-bold'
                        : 'bg-[#FDFCF7] text-natural-category border-natural-border hover:border-natural-sage hover:text-natural-sage'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Type de Viande / Poisson */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-natural-category uppercase tracking-wider block">
                Type de chair ou régime
              </label>
              <div className="flex flex-wrap gap-1">
                {[
                  { key: 'Tous', label: 'Tous' },
                  { key: 'Volaille', label: '🍗 Volaille' },
                  { key: 'Bœuf', label: '🥩 Bœuf' },
                  { key: 'Porc', label: '🥓 Porc' },
                  { key: 'Poisson/Crustacés', label: '🐟 Poisson / Crustacés' },
                  { key: 'Sans viande', label: '🌱 Végétarien' }
                ].map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setSelectedMeat(m.key)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                      selectedMeat === m.key
                        ? 'bg-[#A68A64] text-white border-[#A68A64] shadow-xs font-bold'
                        : 'bg-[#FDFCF7] text-natural-category border-natural-border hover:border-[#A68A64] hover:text-[#825E35]'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filteredRecipes.length === 0 ? (
            <div className="text-center p-12 bg-natural-paper rounded-2xl border-2 border-dashed border-natural-border">
              <BookOpen className="w-12 h-12 text-natural-border mx-auto mb-3" />
              <h3 className="text-base font-semibold text-natural-sage">Aucune recette trouvée</h3>
              <p className="text-sm text-natural-category mt-1">
                {searchQuery ? "Essayez une autre recherche." : "Ajoutez ou générez votre première recette pour démarrer !"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredRecipes.map((recipe) => {
                const isSelected = selectedRecipeIds.includes(recipe.id);
                
                // Track missing/available count for badge
                let fullyStockedCount = 0;
                recipe.ingredients.forEach(ri => {
                  const check = getIngredientStockStatus(ri.name, ri.quantity, ri.unit);
                  if (check.status === 'enough') fullyStockedCount++;
                });
                const percentageInStock = Math.round((fullyStockedCount / recipe.ingredients.length) * 100) || 0;

                return (
                  <div 
                    key={recipe.id} 
                    id={`recipe-card-${recipe.id}`}
                    className={`bg-white rounded-3xl border transition-all overflow-hidden flex flex-col justify-between ${
                      isSelected 
                        ? 'border-natural-sage ring-2 ring-natural-sage/15 shadow-md' 
                        : 'border-natural-border hover:border-[#8E916D] shadow-sm'
                    }`}
                  >
                    <div className="p-5 space-y-4">
                      {/* Top labels */}
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="space-y-1">
                          <span className="text-[10px] font-mono tracking-wider uppercase text-natural-sage bg-natural-sage-light px-2.5 py-0.5 rounded-full inline-block font-bold">
                            Pour 4 Pers.
                          </span>
                          {recipe.bookRef && (
                            <span className="text-[9px] font-medium text-natural-category block bg-natural-paper border border-[#EBEBE0] px-2 py-0.5 rounded-md w-fit">
                              📚 {recipe.bookRef}
                            </span>
                          )}
                        </div>
                        
                        {/* Selector checkbox */}
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => onSelectRecipe(recipe.id, e.target.checked)}
                            className="w-5 h-5 accent-natural-sage rounded border-natural-border cursor-pointer"
                          />
                          <span className={`text-[11px] font-bold uppercase tracking-wider ${isSelected ? 'text-natural-sage' : 'text-natural-category'}`}>
                            {isSelected ? 'Sélectionné' : 'Sélectionner'}
                          </span>
                        </label>
                      </div>

                      {/* Recipe Title & Rating */}
                      <div>
                        <h3 className="font-serif font-bold text-lg text-neutral-900 leading-tight">
                          {recipe.name}
                        </h3>
                        
                        {/* Taste & Ease Stars */}
                        <div className="grid grid-cols-2 gap-2 mt-3 p-2 bg-natural-paper rounded-xl text-xs text-natural-text border border-natural-border/60">
                          <div>
                            <span className="block text-[9px] font-bold text-natural-category uppercase tracking-wider">Saveur :</span>
                            <div className="flex gap-0.5 mt-0.5">
                              {[1, 2, 3, 4].map((star) => (
                                <Star 
                                  key={star}
                                  onClick={() => onUpdateRating(recipe.id, star, recipe.ratingEase || 0)}
                                  className={`w-3.5 h-3.5 cursor-pointer transition-colors ${
                                    star <= (recipe.ratingTaste || 0) 
                                      ? 'fill-natural-accent text-natural-accent' 
                                      : 'text-natural-border hover:text-natural-accent/55'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                          <div>
                            <span className="block text-[9px] font-bold text-natural-category uppercase tracking-wider">Facilité :</span>
                            <div className="flex gap-0.5 mt-0.5">
                              {[1, 2, 3, 4].map((star) => (
                                <Star 
                                  key={star}
                                  onClick={() => onUpdateRating(recipe.id, recipe.ratingTaste || 0, star)}
                                  className={`w-3.5 h-3.5 cursor-pointer transition-colors ${
                                    star <= (recipe.ratingEase || 0) 
                                      ? 'fill-natural-accent text-natural-accent' 
                                      : 'text-natural-border hover:text-natural-accent/55'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Stock Check Summary */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-natural-category">Ingrédients en stock :</span>
                          <span className={`font-mono font-bold ${percentageInStock === 100 ? 'text-natural-sage font-extrabold' : 'text-natural-text'}`}>
                            {percentageInStock}%
                          </span>
                        </div>
                        <div className="w-full bg-[#EBEBE0] h-1.5 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all ${
                              percentageInStock === 100 
                                ? 'bg-natural-sage' 
                                : percentageInStock > 40 
                                ? 'bg-[#A68A64]' 
                                : 'bg-[#D6D6C2]'
                            }`}
                            style={{ width: `${percentageInStock}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Bottom actions */}
                    <div className="bg-natural-paper/70 px-4 py-3 border-t border-natural-border/40 flex items-center justify-between gap-2">
                      <button
                        onClick={() => onDeleteRecipe(recipe.id)}
                        className="text-natural-category hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Supprimer la recette"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => onPrepareRecipe(recipe)}
                        className="inline-flex items-center gap-1 px-4 py-2 text-xs font-bold rounded-2xl bg-natural-accent hover:bg-opacity-90 text-white transition-colors shadow-xs cursor-pointer"
                      >
                        <Play className="w-3 h-3 fill-current text-white" />
                        Préparer !
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT ONE COL: SELECTION WORKSPACE & AI ENGINE */}
        <div className="space-y-6">
          {/* ACTIVE SELECTION SIDEBAR PANEL */}
          <div className="bg-white rounded-3xl border border-natural-border p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-natural-border pb-3">
              <div className="flex items-center gap-2">
                <Book className="w-5 h-5 text-natural-sage" />
                <h3 className="font-serif font-bold text-base text-neutral-900">Ma Sélection ({selectedRecipeIds.length})</h3>
              </div>
              {selectedRecipeIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    selectedRecipeIds.forEach(id => onSelectRecipe(id, false));
                  }}
                  className="text-[10px] text-rose-600 hover:underline font-bold transition-all cursor-pointer"
                >
                  Tout vider
                </button>
              )}
            </div>

            {selectedRecipeIds.length === 0 ? (
              <div className="py-6 text-center space-y-1 border-2 border-dashed border-natural-border/70 rounded-2xl bg-natural-paper">
                <p className="text-xs font-medium text-natural-category">Aucune recette active</p>
                <p className="text-[10px] text-natural-category/85 max-w-[180px] mx-auto px-2">Cochez des recettes à gauche pour composer votre liste.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {recipes.filter(r => selectedRecipeIds.includes(r.id)).map(recipe => (
                  <div 
                    key={recipe.id}
                    className="flex items-center justify-between gap-2 p-2.5 bg-natural-sage-light/20 hover:bg-natural-sage-light/35 border border-natural-border/50 rounded-xl transition-all"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-xs text-natural-sage truncate block" title={recipe.name}>
                        🍲 {recipe.name}
                      </span>
                      <span className="text-[9px] text-natural-category font-mono block mt-0.5">
                        {recipe.ingredients.length} ingrédient(s)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectRecipe(recipe.id, false)}
                      className="text-natural-category hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Retirer de la sélection"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl border border-natural-border p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-natural-sage">
              <Sparkles className="w-5 h-5 text-natural-sage" />
              <h2 className="font-serif font-bold text-lg">Idées & Suggestions IA</h2>
            </div>
            
            <p className="text-xs text-natural-category">
              Faites appel à Gemini pour recommander des repas sur-mesure pour 4 personnes, selon le stock ou vos envies de saison !
            </p>

            {/* Selector modes */}
            <div className="grid grid-cols-2 gap-1 bg-[#EBEBE0]/75 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setAiMode('exact-stock')}
                className={`text-xs py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  aiMode === 'exact-stock' ? 'bg-white text-natural-sage shadow-xs border border-natural-border/35' : 'text-natural-category hover:text-natural-sage'
                }`}
              >
                Selon Stock Requis
              </button>
              <button
                type="button"
                onClick={() => setAiMode('custom')}
                className={`text-xs py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  aiMode === 'custom' ? 'bg-white text-natural-sage shadow-xs border border-natural-border/35' : 'text-natural-category hover:text-natural-sage'
                }`}
              >
                Envies Spécifiques
              </button>
            </div>

            {aiMode === 'custom' && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-natural-category uppercase tracking-wider block">Qu'avez-vous envie de manger ?</label>
                <textarea
                  placeholder="Ex : Des repas légers avec des tomates, ou une idée de cuisine italienne réconfortante..."
                  value={customAiPrompt}
                  onChange={(e) => setCustomAiPrompt(e.target.value)}
                  className="w-full text-xs p-3 border border-natural-border rounded-xl bg-natural-paper focus:outline-none focus:ring-1 focus:ring-natural-sage focus:bg-white resize-y min-h-[70px]"
                />
              </div>
            )}

            {aiMode === 'exact-stock' && (
              <div className="bg-natural-highlight border border-[#D6D6C2] p-3.5 rounded-xl text-xs text-[#825E35]">
                <span className="font-extrabold block mb-1">💡 Mode Vidage de Frigo :</span> Gemini composera des recettes en exploitant idéalement ce que vous avez configuré dans votre page de stocks.
              </div>
            )}

            <button
              id="ai-generate-recipes-btn"
              onClick={handleGenerateAiSuggestions}
              disabled={isLoadingAi || (aiMode === 'custom' && !customAiPrompt.trim())}
              className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 bg-natural-sage text-white font-bold text-xs rounded-2xl shadow-sm hover:bg-[#4E4E36] disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              {isLoadingAi ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Marmite en cours... (15s)
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Générer des recettes (x3)
                </>
              )}
            </button>

            {aiError && (
              <div className="p-3 bg-red-150/10 border border-red-200 text-red-800 text-xs rounded-lg">
                <span className="font-semibold block mb-0.5">La génération a échoué</span>
                {aiError}
              </div>
            )}
          </div>

          {/* AI SUGGESTIONS DISPLAY */}
          {aiSuggestions.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-serif font-bold text-natural-sage text-sm flex items-center gap-1.5">
                <span className="p-1 px-2 bg-natural-sage-light border border-natural-border rounded-full text-natural-sage text-xs">✍️</span>
                Suggestions Chef Gemini (4 Pers.)
              </h3>
              
              <div className="space-y-3">
                {aiSuggestions.map((sug, idx) => (
                  <div key={idx} className="bg-[#FDFCF7] border border-natural-border rounded-3xl p-5 shadow-2xs space-y-3">
                    <div>
                      <h4 className="font-bold text-neutral-900 text-sm">{sug.name}</h4>
                      <p className="text-[11px] text-natural-category italic mt-0.5">
                        💡 {sug.matchingReason}
                      </p>
                    </div>

                    {/* Ingredients list mini */}
                    <div className="text-[11px] space-y-1">
                      <span className="font-bold text-natural-sage block">Ingrédients requis séléctionnés :</span>
                      <div className="flex flex-wrap gap-1">
                        {sug.ingredients.map((ing: any, iidx: number) => (
                          <span key={iidx} className="bg-natural-sage-light/50 px-1.5 py-0.5 rounded text-natural-sage font-medium text-[10px]">
                            {ing.name} ({ing.quantity} {ing.unit})
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => handleSaveSuggestedRecipe(sug)}
                      className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-white hover:bg-natural-sage hover:text-white text-natural-sage border-2 border-natural-sage rounded-2xl text-xs font-bold shadow-3xs transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Ajouter au Cahier de Recettes
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MANUAL/FILE IMPORT MODAL */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-natural-sage/35 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-natural-paper rounded-[32px] border border-natural-border shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-fade-in animate-duration-150">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-natural-border flex items-center justify-between bg-natural-sage-light/30">
              <div>
                <h3 className="font-serif font-bold text-natural-sage text-xl">Importer et Gabarits de Recettes</h3>
                <p className="text-xs text-natural-category mt-1">Vos recettes de cuisine sont conservées de façon sûre. Utilisez les gabarits standardisés ou importez-en à la volée !</p>
              </div>
              <button 
                onClick={() => {
                  setIsImportModalOpen(false);
                  setParseError(null);
                }}
                className="text-natural-category hover:text-natural-sage font-bold text-2xl p-1 w-8 h-8 flex items-center justify-center rounded-full hover:bg-natural-sage-light/40 cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-natural-border bg-natural-paper text-xs font-bold">
              <button
                type="button"
                onClick={() => setModalTab('import')}
                className={`flex-1 py-3.5 text-center transition-all cursor-pointer border-b-2 ${
                  modalTab === 'import'
                    ? 'border-natural-sage text-natural-sage bg-white'
                    : 'border-transparent text-natural-category hover:text-natural-sage bg-[#F5F4EA]/40'
                }`}
              >
                📥 Charger un Fichier (.json, .txt, .md)
              </button>
              <button
                type="button"
                onClick={() => setModalTab('templates')}
                className={`flex-1 py-3.5 text-center transition-all cursor-pointer border-b-2 ${
                  modalTab === 'templates'
                    ? 'border-natural-sage text-natural-sage bg-white'
                    : 'border-transparent text-natural-category hover:text-natural-sage bg-[#F5F4EA]/40'
                }`}
              >
                📋 Consulter les Gabarits
              </button>
            </div>

            {modalTab === 'import' ? (
              /* Modal Form For Loading & Parsing */
              <form onSubmit={handleParseRecipe} className="flex-1 overflow-y-auto p-6 space-y-4">
                
                {/* File Upload Zone */}
                <div className="border-2 border-dashed border-natural-border hover:border-natural-sage rounded-2xl p-5 text-center bg-[#FDFCF7] transition-all cursor-pointer">
                  <Upload className="w-8 h-8 text-natural-category mx-auto mb-2" />
                  <p className="text-xs font-bold text-natural-sage">Glissez ou chargez un fichier de recette</p>
                  <p className="text-[10px] text-natural-category mt-0.5 mb-2">Supporte les formats standards : .json (instantané) ou .txt / .md (analyse IA)</p>
                  
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload} 
                    accept=".json,.txt,.md" 
                    className="hidden" 
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center px-4 py-2 bg-white hover:bg-natural-sage-light/40 text-natural-sage rounded-xl text-xs font-bold border border-natural-border shadow-xs cursor-pointer"
                  >
                    Parcourir mes répertoires
                  </button>
                </div>

                {/* Text Input Block */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-natural-sage uppercase tracking-wide block">Contenu textuel ou brut de la recette</label>
                  <textarea
                    required
                    placeholder="Collez ici le texte complet de la recette brute, ou le contenu d'un livre..."
                    value={importedText}
                    onChange={(e) => setImportedText(e.target.value)}
                    className="w-full text-xs p-3 border border-natural-border rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-natural-sage focus:border-natural-sage min-h-[140px] font-mono text-[11px]"
                  />
                </div>

                {/* Book reference */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-natural-sage uppercase tracking-wide block">Livre de recette d'origine / Référence (Optionnel)</label>
                  <input
                    type="text"
                    placeholder="Ex : Tartes Faciles, Page 24, Édition Hachette"
                    value={bookRef}
                    onChange={(e) => setBookRef(e.target.value)}
                    className="w-full text-xs p-3 border border-natural-border rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-natural-sage focus:border-natural-sage"
                  />
                </div>

                {parseError && (
                  <div className="p-3 bg-rose-50 border border-rose-150 text-rose-800 text-xs rounded-lg">
                    <span className="font-semibold block mb-0.5">Erreur rencontrée :</span>
                    {parseError}
                  </div>
                )}

                {/* Footer Actions */}
                <div className="flex justify-end gap-2 border-t border-natural-border pt-4 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setIsImportModalOpen(false);
                      setParseError(null);
                    }}
                    disabled={isParsing}
                    className="px-4 py-2 bg-[#EBEBE0] hover:bg-[#D6D6C2] text-natural-sage rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isParsing || !importedText.trim()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-natural-sage hover:bg-opacity-95 text-white rounded-xl text-xs font-bold disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
                  >
                    {isParsing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analyse par Gemini...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Traduire et stocker (4 pers)
                      </>
                    )}
                  </button>
                </div>

              </form>
            ) : (
              /* Templates View Tab */
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                <div className="bg-natural-sage-light/25 p-4 rounded-2xl border border-natural-border text-center space-y-1.5 animate-fade-in">
                  <p className="text-xs font-semibold text-natural-sage">💡 Sauvegarde & Persistance durable</p>
                  <p className="text-[11px] text-natural-category leading-relaxed">
                    Toutes vos recettes sont stockées sous forme de fichiers individuels dans le dossier <code className="bg-[#EBEBE0] text-natural-sage px-1 py-0.5 rounded text-[10px] font-mono">recipes/</code> directement à la racine de votre projet !
                    Vous pouvez modifier, renommer ou ajouter directement vos propres fichiers de recettes dans ce répertoire (depuis votre éditeur de code ou votre ZIP) pour les voir apparaître à l'écran.
                  </p>
                </div>

                <div className="space-y-4 animate-fade-in">
                  {/* JSON Template block */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-natural-sage uppercase tracking-wide">1. Gabarit Standardisé au format JSON (`.json`)</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(STANDARD_JSON_TEMPLATE);
                          setCopiedType('json');
                          setTimeout(() => setCopiedType(null), 2000);
                        }}
                        className="text-[10px] bg-natural-sage/10 text-natural-sage hover:bg-natural-sage hover:text-white px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer"
                      >
                        {copiedType === 'json' ? "✓ Copié !" : "Copier le JSON"}
                      </button>
                    </div>
                    <pre className="p-3 bg-[#FAF8F0] border border-natural-border text-[10px] rounded-xl font-mono text-natural-text overflow-x-auto max-h-[160px]">
                      {STANDARD_JSON_TEMPLATE}
                    </pre>
                  </div>

                  {/* MD Template block */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-natural-sage uppercase tracking-wide">2. Gabarit Élégant au format Markdown (`.md`)</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(STANDARD_MD_TEMPLATE);
                          setCopiedType('md');
                          setTimeout(() => setCopiedType(null), 2000);
                        }}
                        className="text-[10px] bg-natural-sage/10 text-natural-sage hover:bg-natural-sage hover:text-white px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer"
                      >
                        {copiedType === 'md' ? "✓ Copié !" : "Copier le Markdown"}
                      </button>
                    </div>
                    <pre className="p-3 bg-[#FAF8F0] border border-natural-border text-[10px] rounded-xl font-mono text-natural-text overflow-x-auto max-h-[160px]">
                      {STANDARD_MD_TEMPLATE}
                    </pre>
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-natural-border">
                  <button
                    onClick={() => {
                      setIsImportModalOpen(false);
                      setParseError(null);
                    }}
                    className="px-5 py-2.5 bg-natural-sage hover:bg-opacity-95 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                  >
                    Fermer le dialogue
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
