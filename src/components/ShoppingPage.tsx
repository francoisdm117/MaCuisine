import React, { useState } from 'react';
import { 
  ShoppingBag, Plus, Trash2, CheckCircle2, Circle, 
  MapPin, ShoppingCart, RefreshCw, AlertCircle, HelpCircle, ArrowUpRight,
  FileText, Copy, Check
} from 'lucide-react';
import { Recipe, Ingredient, DatabaseState } from '../types';

interface ShoppingPageProps {
  selectedRecipes: Recipe[];
  stockIngredients: Ingredient[];
  manualItems: DatabaseState['manualShoppingItems'];
  onAddManualItem: (name: string, quantity: number, unit: string, category: 'Marché' | 'Boucher' | 'Fromager' | 'Supermarché') => void;
  onDeleteManualItem: (id: string) => void;
  onClearCompletedManual: () => void;
  onUpdateManualItemStatus: (id: string, completed: boolean) => void;
  onSyncPurchasedToStock: (purchasedItems: Array<{name: string, quantity: number, unit: string, category: string}>) => void;
}

export default function ShoppingPage({
  selectedRecipes,
  stockIngredients,
  manualItems,
  onAddManualItem,
  onDeleteManualItem,
  onClearCompletedManual,
  onUpdateManualItemStatus,
  onSyncPurchasedToStock
}: ShoppingPageProps) {
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemUnit, setNewItemUnit] = useState('pièces');
  const [newItemCategory, setNewItemCategory] = useState<'Marché' | 'Boucher' | 'Fromager' | 'Supermarché'>('Supermarché');
  const [isCategorizing, setIsCategorizing] = useState(false);

  // Export as raw formatted text state
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [copiedListFeedback, setCopiedListFeedback] = useState(false);

  // States to keep track of checked-off items in recipes-based calculations
  // Since recipe items are calculated dynamically, we'll keep a local state of "checked items" by their unique identifier (category + name)
  const [checkedRecipeItems, setCheckedRecipeItems] = useState<Record<string, boolean>>({});

  // Compile the entire list as a neat txt block
  const generateTextList = (): string => {
    let output = `🛒 LISTE DE COURSES - MA CUISINE À MOI (Pour 4 personnes)\n`;
    output += `Générée le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}\n`;
    output += `==================================================\n\n`;

    // 1. Selected recipes
    output += `🍲 RECETTES PLANIFIÉES (${selectedRecipes.length}) :\n`;
    if (selectedRecipes.length === 0) {
      output += `  (Aucune recette planifiée)\n`;
    } else {
      selectedRecipes.forEach(r => {
        output += `  - ${r.name} (4 pers.)\n`;
      });
    }
    output += `\n==================================================\n\n`;

    // 2. Department list
    output += `🥬 ARTICLES COMPILÉS PAR RAYONS :\n\n`;

    let totalItemsCount = 0;

    categories.forEach(cat => {
      const { fromRecipes, fromManual } = getCombinedItemsByCategory(cat);
      if (fromRecipes.length > 0 || fromManual.length > 0) {
        output += `[${cat.toUpperCase()}]\n`;
        
        // Dynamic Recipe items
        fromRecipes.forEach(item => {
          totalItemsCount++;
          const key = `${item.category}_${item.name}`;
          const isChecked = !!checkedRecipeItems[key];
          const checkMark = isChecked ? `[X]` : `[ ]`;
          output += `  ${checkMark} ${item.name} : +${item.neededQty} ${item.unit} (Requis: ${item.requiredQty}, Stock: ${item.stockQty})\n`;
        });

        // Manuel items
        fromManual.forEach(item => {
          totalItemsCount++;
          const checkMark = item.completed ? `[X]` : `[ ]`;
          output += `  ${checkMark} ${item.name} : ${item.quantity} ${item.unit} (Complémentaire)\n`;
        });
        
        output += `\n`;
      }
    });

    if (totalItemsCount === 0) {
      output += `  Votre panier ne contient aucun article.\n`;
    }

    output += `==================================================\n`;
    output += `Généré automatiquement par Ma Cuisine À Moi • Bon appétit !`;
    return output;
  };

  // Helper to query dynamic category of custom items via AI server if requested, or basic fallback
  const handleAutoCategorize = async () => {
    if (!newItemName.trim()) return;
    setIsCategorizing(true);
    try {
      const response = await fetch('/api/ai/categorize-ingredient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newItemName })
      });
      if (response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          if (data.category) {
            setNewItemCategory(data.category);
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsCategorizing(false);
    }
  };

  // Add item form submit
  const handleAddItemSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    onAddManualItem(newItemName.trim(), newItemQty, newItemUnit, newItemCategory);
    setNewItemName('');
    setNewItemQty(1);
    setNewItemUnit('pièces');
    setNewItemCategory('Supermarché');
  };

  // DYNAMIC COMPUTATION OF GROCERIES NEEDED
  // Sum up all ingredients from selected recipes
  const recipeIngredientsSummary: Record<string, { quantity: number; unit: string; cleanName: string }> = {};

  selectedRecipes.forEach(recipe => {
    recipe.ingredients.forEach(ing => {
      const key = ing.name.toLowerCase().trim();
      if (recipeIngredientsSummary[key]) {
        // If units match, add quantities. Otherwise keep the unit, we assume they are standard (g, ml, pièce)
        recipeIngredientsSummary[key].quantity += ing.quantity;
      } else {
        recipeIngredientsSummary[key] = {
          quantity: ing.quantity,
          unit: ing.unit,
          cleanName: ing.name
        };
      }
    });
  });

  // Calculate missing items for each needed recipe ingredient based on stock
  const computedShoppingList: Array<{
    name: string;
    requiredQty: number;
    stockQty: number;
    neededQty: number;
    unit: string;
    category: 'Marché' | 'Boucher' | 'Fromager' | 'Supermarché';
  }> = [];

  // Categorization mapping
  const getIngredientCategory = (name: string): 'Marché' | 'Boucher' | 'Fromager' | 'Supermarché' => {
    const cleanName = name.toLowerCase().trim();
    // Quick local heuristics
    if (
      cleanName.includes('tomate') || cleanName.includes('courgette') || cleanName.includes('pomme') || 
      cleanName.includes('carotte') || cleanName.includes('oignon') || cleanName.includes('ail') || 
      cleanName.includes('salade') || cleanName.includes('avocat') || cleanName.includes('basilic') || 
      cleanName.includes('champignon') || cleanName.includes('poireau') || cleanName.includes('épinard') ||
      cleanName.includes('persil') || cleanName.includes('citron') || cleanName.includes('poire') || 
      cleanName.includes('banane') || cleanName.includes('pommes de terre') || cleanName.includes('fraise')
    ) {
      return 'Marché';
    }
    if (
      cleanName.includes('poulet') || cleanName.includes('boeuf') || cleanName.includes('bœuf') || 
      cleanName.includes('lardon') || cleanName.includes('porc') || cleanName.includes('jambon') || 
      cleanName.includes('saucisse') || cleanName.includes('steak') || cleanName.includes('veau') ||
      cleanName.includes('viande') || cleanName.includes('merguez') || cleanName.includes('dinde')
    ) {
      return 'Boucher';
    }
    if (
      cleanName.includes('oeuf') || cleanName.includes('œuf') || cleanName.includes('parmesan') || 
      cleanName.includes('mozzarella') || cleanName.includes('gruyère') || cleanName.includes('emmental') || 
      cleanName.includes('fromage') || cleanName.includes('cheddar') || cleanName.includes('beurre') ||
      cleanName.includes('roquefort') || cleanName.includes('chèvre') || cleanName.includes('ricotta')
    ) {
      return 'Fromager';
    }
    // Default fallback
    return 'Supermarché';
  };

  Object.keys(recipeIngredientsSummary).forEach(key => {
    const summary = recipeIngredientsSummary[key];
    const stockIng = stockIngredients.find(s => s.name.toLowerCase().trim() === key);
    const stockQty = stockIng ? stockIng.quantity : 0;
    
    // Check if what is in stock covers the recipe needs
    if (stockQty < summary.quantity) {
      const neededQty = summary.quantity - stockQty;
      computedShoppingList.push({
        name: summary.cleanName,
        requiredQty: summary.quantity,
        stockQty: stockQty,
        neededQty: parseFloat(neededQty.toFixed(1)),
        unit: summary.unit,
        category: stockIng ? stockIng.category : getIngredientCategory(summary.cleanName)
      });
    }
  });

  // COMBINE AND SORT BOTH DYNAMIC ITEMS and MANUAL ITEMS BY DEPARTMENT
  const categories: Array<'Marché' | 'Boucher' | 'Fromager' | 'Supermarché'> = ['Marché', 'Boucher', 'Fromager', 'Supermarché'];

  const getCombinedItemsByCategory = (cat: 'Marché' | 'Boucher' | 'Fromager' | 'Supermarché') => {
    const fromRecipes = computedShoppingList.filter(item => item.category === cat);
    const fromManual = manualItems.filter(item => item.category === cat);
    return { fromRecipes, fromManual };
  };

  // Get total dynamic checked items keys to let user push items to stock
  const handleToggleRecipeItemCheck = (name: string, category: string) => {
    const key = `${category}_${name}`;
    setCheckedRecipeItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Push checked products to stock
  const handleImportPurchasedToStock = () => {
    const itemsToSave: Array<{name: string, quantity: number, unit: string, category: string}> = [];

    // 1. Collect from checked recipe items
    computedShoppingList.forEach(item => {
      const key = `${item.category}_${item.name}`;
      if (checkedRecipeItems[key]) {
        itemsToSave.push({
          name: item.name,
          quantity: item.neededQty,
          unit: item.unit,
          category: item.category
        });
      }
    });

    // 2. Collect from checked manual items
    manualItems.forEach(item => {
      if (item.completed) {
        itemsToSave.push({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category
        });
      }
    });

    if (itemsToSave.length === 0) {
      alert("Veuillez d'abord cocher les articles achetés dans votre liste pour pouvoir les synchroniser dans votre stock d'ingrédients.");
      return;
    }

    onSyncPurchasedToStock(itemsToSave);

    // Reset ticks
    setCheckedRecipeItems({});
    // Remove completed manual items online
    onClearCompletedManual();
    
    alert(`Succès! ${itemsToSave.length} ingrédient(s) ajouté(s) ou mis à jour dans vos stocks !`);
  };

  return (
    <div className="space-y-8" id="shopping-page">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-natural-border pb-5">
        <div>
          <h1 className="text-3xl font-serif font-bold text-natural-sage flex items-center gap-2">
            Panier & Liste de Courses
          </h1>
          <p className="text-sm text-natural-category mt-1">
            Les quantités sont calculées pour vos recettes actives (4 Pers.) moins vos stocks d'ingrédients actuels.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => setIsExportModalOpen(true)}
            id="export-shopping-txt-btn"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-[#D6D6C2] hover:bg-natural-sage-light/20 text-natural-sage rounded-2xl text-sm font-bold shadow-xs transition-all cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            Exporter la liste (Texte)
          </button>
          
          <button
            onClick={handleImportPurchasedToStock}
            id="sync-shopping-stock-btn"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-natural-sage hover:bg-opacity-95 text-white rounded-2xl text-sm font-bold shadow-md transition-all cursor-pointer"
          >
            <RefreshCw className="w-4 h-4 text-white" />
            Enregistrer mes achats en Stock
          </button>
        </div>
      </div>

      {/* QUICK RECIPES PLANNER RECAP */}
      <div className="bg-[#EBEBE0]/35 border border-natural-border rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xs font-bold text-natural-sage uppercase tracking-wider">Recettes planifiées ({selectedRecipes.length})</h2>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {selectedRecipes.length === 0 ? (
              <span className="text-xs text-natural-category italic">Aucune recette planifiée. Activez des recettes dans l'onglet Recettes !</span>
            ) : (
              selectedRecipes.map(recipe => (
                <span key={recipe.id} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white border border-natural-border text-natural-sage text-xs font-bold shadow-3xs">
                  🍲 {recipe.name} 
                  <span className="text-[10px] text-natural-category font-mono font-normal">(4 pers.)</span>
                </span>
              ))
            )}
          </div>
        </div>
        {selectedRecipes.length > 0 && (
          <div className="text-xs text-natural-category text-right md:max-w-xs leading-relaxed">
            💡 Les ingrédients listés ci-dessous correspondent uniquement à ce qu'il vous manque pour préparer ces recettes de manière autonome.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* LEFT TWO COLS: LIST BY STORES / DEPARTMENTS */}
        <div className="lg:col-span-2 space-y-6">
          
          {computedShoppingList.length === 0 && manualItems.length === 0 ? (
            <div className="text-center p-16 bg-natural-paper rounded-3xl border-2 border-dashed border-natural-border">
              <ShoppingBag className="w-16 h-16 text-natural-border mx-auto mb-3" />
              <h3 className="text-xl font-serif font-bold text-natural-sage">Votre panier est vide</h3>
              <p className="text-sm text-natural-category max-w-sm mx-auto mt-2 leading-relaxed">
                Sélectionnez des recettes dans le cahier ou ajoutez des courses manuellement pour composer votre liste d'emplettes !
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {categories.map(cat => {
                const { fromRecipes, fromManual } = getCombinedItemsByCategory(cat);
                const hasItems = fromRecipes.length > 0 || fromManual.length > 0;
                
                if (!hasItems) return null;

                const getCatColors = (c: string) => {
                  switch(c) {
                    case 'Marché': return { bg: 'bg-[#5A5A40]/10 text-natural-sage border-b border-[#EBEBE0]', dot: 'bg-natural-sage' };
                    case 'Boucher': return { bg: 'bg-[#A68A64]/10 text-[#825E35] border-b border-[#EBEBE0]', dot: 'bg-natural-accent' };
                    case 'Fromager': return { bg: 'bg-[#EBEBE0] text-natural-sage border-b border-[#EBEBE0]', dot: 'bg-natural-sage' };
                    default: return { bg: 'bg-natural-sage text-white border-b border-natural-border', dot: 'bg-white' };
                  }
                };
                const colors = getCatColors(cat);

                return (
                  <div key={cat} id={`dept-container-${cat}`} className="bg-white rounded-3xl border border-natural-border overflow-hidden shadow-sm">
                    {/* Dept Title Banner */}
                    <div className={`p-4 flex items-center justify-between ${colors.bg}`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                        <h3 className="text-xs font-serif font-bold uppercase tracking-wider">{cat}</h3>
                      </div>
                      <span className="text-[10px] font-mono font-bold bg-white text-natural-sage px-3 py-0.5 rounded-full border border-natural-border/60 shadow-3xs">
                        {fromRecipes.length + fromManual.length} article(s)
                      </span>
                    </div>

                    {/* Groceries Items Grid */}
                    <div className="divide-y divide-natural-border/40">
                      
                      {/* 1. Dynamic Items from Planified Recipes */}
                      {fromRecipes.map((item, idx) => {
                        const key = `${item.category}_${item.name}`;
                        const isChecked = !!checkedRecipeItems[key];

                        return (
                          <div 
                            key={`rec-${idx}`} 
                            onClick={() => handleToggleRecipeItemCheck(item.name, item.category)}
                            className={`p-4 flex items-center justify-between gap-3 hover:bg-natural-sage-light/20 cursor-pointer transition-colors select-none ${
                              isChecked ? 'bg-natural-sage-light/10' : ''
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <button type="button" className="text-natural-category hover:text-natural-sage transition-colors cursor-pointer">
                                {isChecked ? (
                                  <CheckCircle2 className="w-5.5 h-5.5 text-natural-sage fill-[#EBEBE0]" />
                                ) : (
                                  <Circle className="w-5.5 h-5.5 text-natural-border" />
                                )}
                              </button>
                              
                              <div>
                                <span className={`text-sm font-bold ${isChecked ? 'line-through text-natural-category' : 'text-neutral-900'}`}>
                                  {item.name}
                                </span>
                                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-natural-category">
                                  <span className="font-medium">Recette d'origine</span>
                                  <span>•</span>
                                  <span className="font-mono bg-[#EBEBE0]/50 text-natural-sage px-2 py-0.5 rounded-md text-[10px] font-bold">
                                    Requis : {item.requiredQty} {item.unit} (Stock: {item.stockQty})
                                  </span>
                                </div>
                              </div>
                            </div>

                            <span className={`font-mono text-xs font-bold px-3 py-1.5 rounded-xl ${
                              isChecked ? 'bg-[#EBEBE0] text-natural-category line-through' : 'bg-natural-highlight text-natural-accent border border-natural-border/50'
                            }`}>
                              + {item.neededQty} {item.unit}
                            </span>
                          </div>
                        );
                      })}

                      {/* 2. Manual Custom Items */}
                      {fromManual.map((item) => (
                        <div 
                          key={item.id}
                          onClick={() => onUpdateManualItemStatus(item.id, !item.completed)}
                          className={`p-4 flex items-center justify-between gap-3 hover:bg-natural-sage-light/20 cursor-pointer transition-colors select-none ${
                            item.completed ? 'bg-natural-sage-light/10' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <button type="button" className="text-natural-category hover:text-natural-sage transition-colors cursor-pointer">
                              {item.completed ? (
                                <CheckCircle2 className="w-5.5 h-5.5 text-natural-sage fill-[#EBEBE0]" />
                              ) : (
                                <Circle className="w-5.5 h-5.5 text-natural-border" />
                              )}
                            </button>
                            
                            <div>
                              <span className={`text-sm font-bold ${item.completed ? 'line-through text-natural-category' : 'text-neutral-900'}`}>
                                {item.name}
                              </span>
                              <span className="ml-2 inline-block text-[9px] bg-natural-highlight text-natural-accent border border-natural-border/40 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                                Complémentaire
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                            <span className={`font-mono text-xs font-bold px-3 py-1.5 rounded-xl ${
                              item.completed ? 'bg-[#EBEBE0] text-natural-category line-through' : 'bg-natural-paper text-natural-sage border border-natural-border'
                            }`}>
                              {item.quantity} {item.unit}
                            </span>
                            <button
                              onClick={() => onDeleteManualItem(item.id)}
                              className="text-natural-category hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Retirer de la liste"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT ONE COL: ADD CUSTOM SHOPPING ITEMS */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-natural-border p-6 shadow-sm space-y-4">
            <h3 className="font-serif font-bold text-natural-sage text-base flex items-center gap-1.5">
              <Plus className="w-5 h-5 text-natural-sage" />
              Ajouter un ingrédient
            </h3>
            
            <form onSubmit={handleAddItemSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-natural-category uppercase tracking-wider block">Description de l'ingrédient</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    required
                    placeholder="Ex : Citrons jaunes, Lait, Saumon..."
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    className="flex-1 text-xs p-3 border border-natural-border rounded-xl bg-natural-paper focus:outline-none focus:ring-1 focus:ring-natural-sage focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleAutoCategorize}
                    disabled={isCategorizing || !newItemName.trim()}
                    className="bg-[#EBEBE0] hover:bg-[#D6D6C2] border border-natural-border text-natural-sage px-3 rounded-xl text-xs font-bold disabled:opacity-50 transition-colors cursor-pointer"
                    title="Demander à Gemini de ranger automatiquement dans le bon rayon !"
                  >
                    💡 IA
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-natural-category uppercase tracking-wider block">Quantité</label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    required
                    value={newItemQty}
                    onChange={(e) => setNewItemQty(parseFloat(e.target.value) || 1)}
                    className="w-full text-xs p-3 border border-natural-border rounded-xl bg-natural-paper focus:outline-none focus:ring-1 focus:ring-natural-sage focus:bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-natural-category uppercase tracking-wider block">Unité</label>
                  <select
                    value={newItemUnit}
                    onChange={(e) => setNewItemUnit(e.target.value)}
                    className="w-full text-xs p-3 border border-natural-border rounded-xl bg-natural-paper focus:outline-none focus:ring-1 focus:ring-natural-sage focus:bg-white"
                  >
                    <option value="pièces">pièce(s)</option>
                    <option value="g">g (grammes)</option>
                    <option value="ml">ml (millilitres)</option>
                    <option value="pot">Pots</option>
                    <option value="crépine">Crépine</option>
                    <option value="bouteille">Bouteille</option>
                    <option value="pincée">Pincée</option>
                    <option value="cuillère">Cuillère</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-natural-category uppercase tracking-wider block">Rayon de rangement / Magasin</label>
                <select
                  value={newItemCategory}
                  onChange={(e) => setNewItemCategory(e.target.value as any)}
                  className="w-full text-xs p-3 border border-natural-border rounded-xl bg-natural-paper focus:outline-none focus:ring-1 focus:ring-natural-sage focus:bg-white"
                >
                  <option value="Marché">🥬 Marché (Fruits & Légumes)</option>
                  <option value="Boucher">🥩 Boucher (Viande & Charcuterie)</option>
                  <option value="Fromager">🧀 Fromager (Fromage, Œufs & Produits laitiers frais)</option>
                  <option value="Supermarché">🛒 Supermarché (Épicerie sèche & Crème fraîche industrielle)</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 py-3 px-4 bg-natural-sage text-white font-bold text-xs rounded-2xl shadow-sm hover:bg-opacity-95 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Ajouter à ma liste de courses
              </button>
            </form>
          </div>

          {/* GROCERY RUN TRICK CARD */}
          <div className="bg-natural-highlight border border-[#D6D6C2] rounded-2xl p-5 text-xs text-[#825E35] space-y-2.5 shadow-3xs">
            <span className="font-extrabold text-[#825E35] flex items-center gap-1 text-[13px]">
              📍 Conseil d'utilisation (iPad)
            </span>
            <p className="leading-relaxed">
              Pour faire vos courses dans le magasin physique avec votre <strong>iPad</strong> : cochez simplement les ingrédients au fur et à mesure que vous les mettez dans votre chariot.
            </p>
            <p className="leading-relaxed">
              Une fois arrivé à la maison, cliquez sur <strong>"Enregistrer mes achats en Stock"</strong> en haut de la page. Les ingrédients cochés seront automatiquement intégrés à votre inventaire d'ingrédients !
            </p>
          </div>
        </div>
      </div>

      {/* EXPORT LOGISTICS TEXT DIALOG */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-natural-sage/35 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-natural-paper rounded-[32px] border border-natural-border shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-fade-in animate-duration-150">
            {/* Modal Header */}
            <div className="p-6 border-b border-natural-border flex items-center justify-between bg-natural-sage-light/30">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-natural-sage" />
                <div>
                  <h3 className="font-serif font-bold text-natural-sage text-lg leading-tight">Exportation de la Liste de Courses</h3>
                  <p className="text-[11px] text-natural-category mt-0.5">Votre liste d'achats triée par rayons au format brut, idéale pour copier dans WhatsApp, un SMS ou Apple Notes.</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setIsExportModalOpen(false);
                  setCopiedListFeedback(false);
                }}
                className="text-natural-category hover:text-natural-sage font-bold text-2xl p-1 w-8 h-8 flex items-center justify-center rounded-full hover:bg-natural-sage-light/40 cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-natural-sage uppercase tracking-wide flex items-center justify-between">
                  <span>Texte brut structuré</span>
                  <span className="font-mono text-[9px] text-natural-category lowercase font-normal">(Sélectionnable et modifiable directement ci-dessous)</span>
                </label>
                <textarea
                  readOnly
                  value={generateTextList()}
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  className="w-full text-[11px] p-4 border border-natural-border rounded-2xl bg-white focus:outline-none focus:ring-1 focus:ring-natural-sage focus:border-natural-sage min-h-[250px] font-mono leading-relaxed"
                />
              </div>

              <div className="bg-[#FAF8F0] p-3 rounded-xl border border-[#D6D6C2] text-[11px] text-natural-category leading-relaxed">
                💡 <strong>Astuce :</strong> Appuyez sur le bouton vert ci-dessous pour copier l'ensemble de la liste en un clic ! Si le presse-papiers est restreint par votre navigateur en mode iFrame, vous pouvez copier directement le texte dans l'encadré ci-dessus.
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-6 border-t border-natural-border bg-[#F5F4EA]/40 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setIsExportModalOpen(false);
                  setCopiedListFeedback(false);
                }}
                className="px-5 py-2.5 bg-[#EBEBE0] hover:bg-[#D6D6C2] text-natural-sage rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Fermer
              </button>

              <button
                type="button"
                onClick={() => {
                  try {
                    navigator.clipboard.writeText(generateTextList());
                    setCopiedListFeedback(true);
                    setTimeout(() => setCopiedListFeedback(false), 3000);
                  } catch (err) {
                    alert("Erreur de copier automatique. Veuillez copier manuellement le texte ci-dessus.");
                  }
                }}
                className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer ${
                  copiedListFeedback 
                    ? 'bg-natural-sage text-white' 
                    : 'bg-natural-accent hover:opacity-95 text-white'
                }`}
              >
                {copiedListFeedback ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    Copié avec succès !
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-white" />
                    Copier dans le presse-papiers
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
