import React, { useState, useEffect } from 'react';
import { ChefHat, ShoppingBag, Loader2, Sparkles, AlertTriangle, MessageCircle, X } from 'lucide-react';
import Navigation from './components/Navigation';
import RecipeBookPage from './components/RecipeBookPage';
import ShoppingPage from './components/ShoppingPage';
import StocksPage from './components/StocksPage';
import RatatouilleChatPage from './components/RatatouilleChatPage';
import KitchenPage from './components/KitchenPage';
import { Ingredient, Recipe, DatabaseState } from './types';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'recipes' | 'shopping' | 'stocks' | 'kitchen' | 'ratatouille'>('recipes');
  
  // Database state
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([]);
  const [manualShoppingItems, setManualShoppingItems] = useState<DatabaseState['manualShoppingItems']>([]);
  
  // Loading & error states
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Active cooking recipe
  const [activeCookingRecipe, setActiveCookingRecipe] = useState<Recipe | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Initial Fetch
  const fetchDB = async () => {
    try {
      setIsLoading(true);
      setErrorMsg(null);
      const res = await fetch('/api/db');
      if (!res.ok) {
        throw new Error(`Le serveur a renvoyé une erreur (Status ${res.status}).`);
      }
      
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error("Le serveur de données a renvoyé un contenu invalide (attendu: JSON).");
      }
      
      const data: DatabaseState = await res.json();
      
      setIngredients(data.ingredients || []);
      setRecipes(data.recipes || []);
      setSelectedRecipeIds(data.selectedRecipeIds || []);
      setManualShoppingItems(data.manualShoppingItems || []);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Impossible de se connecter au serveur de données cuisine.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDB();
  }, []);

  // INGREDIENTS/STOCK HANDLERS
  const handleAddIngredient = async (item: Ingredient) => {
    try {
      setIngredients(prev => {
        const index = prev.findIndex(i => i.id === item.id);
        if (index !== -1) {
          const next = [...prev];
          next[index] = item;
          return next;
        }
        return [...prev, item];
      });
      
      await fetch('/api/db/ingredients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
    } catch (err) {
      console.error('Save ingredient error:', err);
    }
  };

  const handleDeleteIngredient = async (id: string) => {
    try {
      setIngredients(prev => prev.filter(i => i.id !== id));
      await fetch(`/api/db/ingredients/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Delete ingredient error:', err);
    }
  };

  const handleUpdateQuantity = async (id: string, newQty: number) => {
    try {
      const itemToUpdate = ingredients.find(i => i.id === id);
      if (!itemToUpdate) return;
      
      const updated = { ...itemToUpdate, quantity: parseFloat(newQty.toFixed(1)) };
      
      setIngredients(prev => prev.map(i => i.id === id ? updated : i));
      
      await fetch('/api/db/ingredients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
    } catch (err) {
      console.error('Update qty error:', err);
    }
  };

  // RECIPES HANDLERS
  const handleAddRecipe = async (recipe: Recipe) => {
    try {
      setRecipes(prev => {
        const index = prev.findIndex(r => r.id === recipe.id);
        if (index !== -1) {
          const next = [...prev];
          next[index] = recipe;
          return next;
        }
        return [...prev, recipe];
      });
      await fetch('/api/db/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipe)
      });
    } catch (err) {
      console.error('Add recipe error:', err);
    }
  };

  const handleDeleteRecipe = async (id: string) => {
    try {
      setRecipes(prev => prev.filter(r => r.id !== id));
      setSelectedRecipeIds(prev => prev.filter(rid => rid !== id));
      if (activeCookingRecipe?.id === id) setActiveCookingRecipe(null);
      
      await fetch(`/api/db/recipes/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Delete recipe error:', err);
    }
  };

  const handleUpdateRating = async (id: string, taste: number, ease: number) => {
    try {
      setRecipes(prev => prev.map(r => r.id === id ? { ...r, ratingTaste: taste, ratingEase: ease } : r));
      await fetch(`/api/db/recipes/${id}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratingTaste: taste, ratingEase: ease })
      });
    } catch (err) {
      console.error('Update rating error:', err);
    }
  };

  const handleSelectRecipe = async (id: string, selected: boolean) => {
    try {
      let nextList = [...selectedRecipeIds];
      if (selected) {
        if (!nextList.includes(id)) nextList.push(id);
      } else {
        nextList = nextList.filter(rid => rid !== id);
      }
      setSelectedRecipeIds(nextList);

      await fetch('/api/db/selected-recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedRecipeIds: nextList })
      });
    } catch (err) {
      console.error('Select recipe error:', err);
    }
  };

  // MANUAL SHOPPING HANDLERS
  const handleAddManualItem = async (name: string, quantity: number, unit: string, category: 'Marché' | 'Boucher' | 'Fromager' | 'Supermarché') => {
    const newItem = {
      id: 'sh_' + Math.random().toString(36).substr(2, 9),
      name,
      quantity,
      unit,
      category,
      completed: false
    };

    try {
      setManualShoppingItems(prev => [...prev, newItem]);
      await fetch('/api/db/manual-shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem)
      });
    } catch (err) {
      console.error('Add manual shopping error:', err);
    }
  };

  const handleDeleteManualItem = async (id: string) => {
    try {
      setManualShoppingItems(prev => prev.filter(i => i.id !== id));
      await fetch(`/api/db/manual-shopping/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Delete manual shopping error:', err);
    }
  };

  const handleUpdateManualItemStatus = async (id: string, completed: boolean) => {
    try {
      const item = manualShoppingItems.find(i => i.id === id);
      if (!item) return;

      const updated = { ...item, completed };
      setManualShoppingItems(prev => prev.map(i => i.id === id ? updated : i));

      await fetch('/api/db/manual-shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
    } catch (err) {
      console.error('Update status manual error:', err);
    }
  };

  const handleClearCompletedManual = async () => {
    try {
      setManualShoppingItems(prev => prev.filter(item => !item.completed));
      await fetch('/api/db/manual-shopping/clear-completed', { method: 'POST' });
    } catch (err) {
      console.error('Clear completed manual error:', err);
    }
  };

  // ADVANCED ACTIONS: SYNC PURCHASES TO INVENTORY STOCK
  const handleSyncPurchasedToStock = async (purchasedItems: Array<{name: string, quantity: number, unit: string, category: string}>) => {
    // We update local and server ingredients
    const nextIngredients = [...ingredients];
    
    for (const item of purchasedItems) {
      const cleanName = item.name.toLowerCase().trim();
      const existingIdx = nextIngredients.findIndex(s => s.name.toLowerCase().trim() === cleanName);
      
      let updatedItem: Ingredient;
      
      if (existingIdx !== -1) {
        // Upgrade current stock levels
        const matched = nextIngredients[existingIdx];
        updatedItem = {
          ...matched,
          quantity: parseFloat((matched.quantity + item.quantity).toFixed(1))
        };
        nextIngredients[existingIdx] = updatedItem;
      } else {
        // Generate new catalog row
        updatedItem = {
          id: 'ing_' + Math.random().toString(36).substr(2, 9),
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category as any
        };
        nextIngredients.push(updatedItem);
      }

      // Save item to server back-office
      try {
        await fetch('/api/db/ingredients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedItem)
        });
      } catch (err) {
        console.error('Error saving back to server details:', err);
      }
    }

    setIngredients(nextIngredients);
  };

  // COOKING ACTIONS: DEDUCT RECIPE PORTIONS FROM STOCK
  const handleCompleteCooking = async (ingredientsUsed: { name: string; quantity: number; unit: string }[]) => {
    const nextIngredients = [...ingredients];

    for (const item of ingredientsUsed) {
      const cleanName = item.name.toLowerCase().trim();
      const idx = nextIngredients.findIndex(s => s.name.toLowerCase().trim() === cleanName);

      if (idx !== -1) {
        const current = nextIngredients[idx];
        const newQty = Math.max(0, current.quantity - item.quantity); // Prevent negative stock levels
        const updated = { ...current, quantity: parseFloat(newQty.toFixed(1)) };
        nextIngredients[idx] = updated;

        // Sync with server API
        try {
          await fetch('/api/db/ingredients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated)
          });
        } catch (err) {
          console.error('Error reducing stock level on server:', err);
        }
      }
    }

    setIngredients(nextIngredients);
    setActiveCookingRecipe(null); // Reset target recipe after completed
  };

  // Navigation callbacks
  const handlePrepareRecipe = (recipe: Recipe) => {
    setActiveCookingRecipe(recipe);
    setCurrentTab('kitchen');
  };

  const handleSelectRecipeForKitchen = (recipe: Recipe) => {
    setActiveCookingRecipe(recipe);
  };

  const selectedRecipes = recipes.filter(r => selectedRecipeIds.includes(r.id));

  return (
    <div className="min-h-screen bg-natural-bg font-sans text-natural-text flex flex-col justify-between">
      


      {/* STICKY TAB NAVIGATION BAR */}
      <Navigation
        currentTab={currentTab}
        onChangeTab={setCurrentTab}
        selectedRecipesCount={selectedRecipeIds.length}
        isCookingActive={!!activeCookingRecipe}
      />

      {/* CORE WORKSPACE SCREEN CONTAINER */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="text-center py-20 space-y-4">
            <Loader2 className="w-12 h-12 text-natural-sage animate-spin mx-auto" />
            <h2 className="font-serif font-medium text-natural-text">Chargement de votre assistant...</h2>
            <p className="text-xs text-natural-category max-w-xs mx-auto">Veuillez patienter pendant la synchronisation avec le serveur local.</p>
          </div>
        ) : errorMsg ? (
          <div className="max-w-md mx-auto bg-natural-highlight border border-natural-border rounded-xl p-6 text-center space-y-4 shadow-sm">
            <AlertTriangle className="w-12 h-12 text-natural-accent mx-auto" />
            <h2 className="text-lg font-serif font-semibold text-natural-accent">Échec de la synchronisation</h2>
            <p className="text-xs text-natural-category leading-relaxed">{errorMsg}</p>
            <button
              onClick={fetchDB}
              className="px-4 py-2 bg-natural-sage hover:bg-opacity-90 text-white font-semibold text-xs rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              Réessayer
            </button>
          </div>
        ) : (
          <div>
            {currentTab === 'recipes' && (
              <RecipeBookPage
                recipes={recipes}
                stockIngredients={ingredients}
                selectedRecipeIds={selectedRecipeIds}
                onSelectRecipe={handleSelectRecipe}
                onAddRecipe={handleAddRecipe}
                onDeleteRecipe={handleDeleteRecipe}
                onUpdateRating={handleUpdateRating}
                onPrepareRecipe={handlePrepareRecipe}
              />
            )}

            {currentTab === 'shopping' && (
              <ShoppingPage
                selectedRecipes={selectedRecipes}
                stockIngredients={ingredients}
                manualItems={manualShoppingItems}
                onAddManualItem={handleAddManualItem}
                onDeleteManualItem={handleDeleteManualItem}
                onClearCompletedManual={handleClearCompletedManual}
                onUpdateManualItemStatus={handleUpdateManualItemStatus}
                onSyncPurchasedToStock={handleSyncPurchasedToStock}
              />
            )}

            {currentTab === 'stocks' && (
              <StocksPage
                stockIngredients={ingredients}
                onAddIngredient={handleAddIngredient}
                onDeleteIngredient={handleDeleteIngredient}
                onUpdateQuantity={handleUpdateQuantity}
              />
            )}

            {currentTab === 'ratatouille' && (
              <RatatouilleChatPage
                stockIngredients={ingredients}
                onStockUpdated={(newStock) => setIngredients(newStock)}
              />
            )}

            {currentTab === 'kitchen' && (
              <KitchenPage
                activeRecipe={activeCookingRecipe}
                recipes={recipes}
                onBackToRecipes={() => setCurrentTab('recipes')}
                onSelectRecipeForKitchen={handleSelectRecipeForKitchen}
                onCompleteCooking={handleCompleteCooking}
              />
            )}
          </div>
        )}
      </main>

      <button
        type="button"
        aria-label="Ouvrir Ratatouille"
        aria-expanded={isChatOpen}
        onClick={() => setIsChatOpen(true)}
        className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full bg-natural-accent px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-natural-accent/20 transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-natural-accent/25"
      >
        <MessageCircle className="h-5 w-5" />
        <span className="hidden sm:inline">Parler à Ratatouille</span>
      </button>

      {isChatOpen && (
        <div
          className="fixed inset-0 z-40 bg-natural-text/20 backdrop-blur-[2px]"
          onClick={() => setIsChatOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        aria-label="Assistant Ratatouille"
        aria-hidden={!isChatOpen}
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-xl transform bg-natural-paper shadow-2xl transition-transform duration-300 ease-out ${
          isChatOpen ? 'translate-x-0' : 'pointer-events-none translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-natural-border bg-natural-sage px-5 py-4 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15">
                <ChefHat className="h-5 w-5" />
              </div>
              <div>
                <p className="font-serif text-lg font-semibold">Ratatouille</p>
                <p className="text-xs text-white/75">Votre sous-chef, toujours à portée de main</p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Fermer Ratatouille"
              onClick={() => setIsChatOpen(false)}
              className="rounded-xl p-2 text-white/80 transition-colors hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/60"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <RatatouilleChatPage
              compact
              stockIngredients={ingredients}
              onStockUpdated={(newStock) => setIngredients(newStock)}
            />
          </div>
        </div>
      </aside>

      {/* FOOTER SECTION */}
      <footer className="bg-natural-sage text-natural-highlight border-t border-natural-border py-8 text-center text-xs space-y-2 mt-12 bg-opacity-95">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-white/80 font-medium">
            © {new Date().getFullYear()} Ma cuisine à moi • Assistant de Cuisine et de Courses.
          </p>
          <div className="flex items-center gap-2 text-[#D6D6C2] font-mono">
            <span>Volume de Stockage : server-data/db.json</span>
            <span>•</span>
            <span>Port: 3000</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
