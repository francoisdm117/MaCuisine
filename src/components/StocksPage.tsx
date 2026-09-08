import React, { useState } from 'react';
import { 
  Warehouse, Search, Plus, Minus, Trash2, Edit3, 
  Check, Archive, ShoppingBag, Grid, ListFilter
} from 'lucide-react';
import { Ingredient } from '../types';

interface StocksPageProps {
  stockIngredients: Ingredient[];
  onAddIngredient: (ingredient: Ingredient) => void;
  onDeleteIngredient: (id: string) => void;
  onUpdateQuantity: (id: string, newQty: number) => void;
}

export default function StocksPage({
  stockIngredients,
  onAddIngredient,
  onDeleteIngredient,
  onUpdateQuantity
}: StocksPageProps) {
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  // New stock item form state
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState(1);
  const [newUnit, setNewUnit] = useState('g');
  const [newCategory, setNewCategory] = useState<'Marché' | 'Boucher' | 'Fromager' | 'Supermarché'>('Supermarché');

  // Search filter matching
  const filteredStock = stockIngredients.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  // Handle new item generation submit
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const newIngredient: Ingredient = {
      id: 'ing_' + Math.random().toString(36).substr(2, 9),
      name: newName.trim(),
      quantity: newQty,
      unit: newUnit,
      category: newCategory
    };

    onAddIngredient(newIngredient);

    // Reset fields
    setNewName('');
    setNewQty(1);
    setNewUnit('g');
    setNewCategory('Supermarché');
  };

  const getCategoryEmojiAndColors = (cat: string) => {
    switch(cat) {
      case 'Marché': return { emoji: '🥬', text: 'text-emerald-700', bg: 'bg-emerald-50' };
      case 'Boucher': return { emoji: '🥩', text: 'text-rose-700', bg: 'bg-rose-50' };
      case 'Fromager': return { emoji: '🧀', text: 'text-amber-700', bg: 'bg-amber-50' };
      default: return { emoji: '🛒', text: 'text-blue-700', bg: 'bg-blue-50' };
    }
  };

  return (
    <div className="space-y-8" id="stocks-page">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-natural-border pb-5">
        <div>
          <h1 className="text-3xl font-serif font-bold text-natural-sage flex items-center gap-2">
            Gestion des Stocks
          </h1>
          <p className="text-sm text-natural-category mt-1">
            Visualisez et modifiez les quantités d'ingrédients disponibles dans vos placards et votre frigo en temps réel.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT TWO COLS: INVENTORY LIST & SEARCH */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search className="w-5 h-5 text-natural-category absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Rechercher des ingrédients en stock..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-natural-border rounded-xl text-xs text-stone-800 focus:outline-none focus:ring-1 focus:ring-natural-sage focus:border-natural-sage"
              />
            </div>
            
            {/* Quick Category Select buttons */}
            <div className="flex gap-1 bg-[#EBEBE0]/35 border border-natural-border p-1.5 rounded-2xl w-full md:w-auto overflow-x-auto">
              <button
                onClick={() => setActiveCategory('all')}
                className={`text-xs px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeCategory === 'all' ? 'bg-white text-natural-sage shadow-3xs border border-natural-border' : 'text-natural-category hover:text-natural-sage'
                }`}
              >
                Tous
              </button>
              <button
                onClick={() => setActiveCategory('Marché')}
                className={`text-xs px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeCategory === 'Marché' ? 'bg-[#5A5A40]/10 text-natural-sage shadow-3xs border border-natural-border' : 'text-natural-category hover:text-natural-sage'
                }`}
              >
                🥬 Marché
              </button>
              <button
                onClick={() => setActiveCategory('Boucher')}
                className={`text-xs px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeCategory === 'Boucher' ? 'bg-[#A68A64]/10 text-natural-accent shadow-3xs border border-[#D6D6C2]' : 'text-natural-category hover:text-natural-sage'
                }`}
              >
                🥩 Boucher
              </button>
              <button
                onClick={() => setActiveCategory('Fromager')}
                className={`text-xs px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeCategory === 'Fromager' ? 'bg-[#EBEBE0] text-natural-sage shadow-3xs border border-[#D6D6C2]' : 'text-natural-category hover:text-natural-sage'
                }`}
              >
                🧀 Fromager
              </button>
              <button
                onClick={() => setActiveCategory('Supermarché')}
                className={`text-xs px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeCategory === 'Supermarché' ? 'bg-natural-sage text-white shadow-3xs' : 'text-natural-category hover:text-natural-sage'
                }`}
              >
                🛒 Épicerie
              </button>
            </div>
          </div>

          {filteredStock.length === 0 ? (
            <div className="text-center p-12 bg-natural-paper rounded-3xl border-2 border-dashed border-natural-border">
              <Archive className="w-12 h-12 text-natural-border mx-auto mb-3" />
              <h3 className="text-base font-bold text-natural-sage">Aucun ingrédient en stock</h3>
              <p className="text-sm text-natural-category mt-1">
                {searchQuery || activeCategory !== 'all' 
                  ? "Essayez d'ajuster vos filtres de recherche." 
                  : "Utilisez le formulaire pour enregistrer vos premiers ingrédients."}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-natural-border overflow-hidden shadow-xs">
              <div className="divide-y divide-natural-border/30">
                {filteredStock.map((item) => {
                  const meta = getCategoryEmojiAndColors(item.category);
                  const isOutOfStock = item.quantity <= 0;

                  return (
                    <div 
                      key={item.id} 
                      id={`stock-row-${item.id}`}
                      className={`p-4 flex items-center justify-between gap-4 transition-colors ${
                        isOutOfStock ? 'bg-[#A68A64]/5' : 'hover:bg-natural-sage-light/10'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Category Symbol Badge */}
                        <span className={`w-9 h-9 rounded-xl ${
                          item.category === 'Marché' ? 'bg-[#5A5A40]/10 text-natural-sage' :
                          item.category === 'Boucher' ? 'bg-[#A68A64]/10 text-natural-accent' :
                          item.category === 'Fromager' ? 'bg-[#EBEBE0]/80 text-natural-sage' : 'bg-natural-highlight text-natural-accent'
                        } flex items-center justify-center text-base`} title={item.category}>
                          {meta.emoji}
                        </span>

                        <div>
                          <h4 className={`text-sm font-bold ${isOutOfStock ? 'text-natural-category line-through' : 'text-neutral-900'}`}>
                            {item.name}
                          </h4>
                          <span className="text-[10px] text-natural-category italic font-medium">
                            Rayon: {item.category}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {/* Adjustment buttons */}
                        <div className="flex items-center border border-natural-border rounded-xl overflow-hidden bg-natural-paper shadow-3xs">
                          <button
                            onClick={() => onUpdateQuantity(item.id, Math.max(0, item.quantity - (item.unit === 'g' || item.unit === 'ml' ? 50 : 1)))}
                            className="p-2 hover:bg-[#EBEBE0]/55 text-natural-sage transition-colors cursor-pointer"
                            title="Retirer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          
                          <span className="px-3 text-xs font-mono font-extrabold text-natural-sage min-w-[70px] text-center">
                            {item.quantity} <span className="text-[9px] font-bold text-natural-category">{item.unit}</span>
                          </span>

                          <button
                            onClick={() => onUpdateQuantity(item.id, item.quantity + (item.unit === 'g' || item.unit === 'ml' ? 50 : 1))}
                            className="p-2 hover:bg-[#EBEBE0]/55 text-natural-sage transition-colors cursor-pointer"
                            title="Ajouter"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Trash symbol */}
                        <button
                          onClick={() => onDeleteIngredient(item.id)}
                          className="text-natural-category hover:text-rose-600 p-2 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Supprimer définitivement"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT ONE COL: FORMS TO ADD STOCK */}
        <div>
          <div className="bg-white rounded-3xl border border-natural-border p-6 shadow-sm space-y-4">
            <h3 className="font-serif font-bold text-natural-sage text-base flex items-center gap-1.5 pb-2 border-b border-natural-border/40">
              <Plus className="w-5 h-5 text-natural-sage" />
              Ajouter au stock
            </h3>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-natural-category uppercase tracking-wider block">Nom de l'ingrédient</label>
                <input
                  type="text"
                  required
                  placeholder="Ex : Beurre, Champignons frais, Porc..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full text-xs p-3 border border-natural-border rounded-xl bg-natural-paper focus:outline-none focus:ring-1 focus:ring-natural-sage focus:border-natural-sage focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-natural-category uppercase tracking-wider block">Quantité</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    required
                    value={newQty}
                    onChange={(e) => setNewQty(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs p-3 border border-natural-border rounded-xl bg-natural-paper focus:outline-none focus:ring-1 focus:ring-natural-sage focus:border-natural-sage focus:bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-natural-category uppercase tracking-wider block">Unité de mesure</label>
                  <select
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    className="w-full text-xs p-3 border border-natural-border rounded-xl bg-natural-paper focus:outline-none focus:ring-1 focus:ring-natural-sage focus:border-natural-sage focus:bg-white"
                  >
                    <option value="g">grammes (g)</option>
                    <option value="ml">millilitres (ml)</option>
                    <option value="pièces">pièce(s)</option>
                    <option value="pots">pot(s)</option>
                    <option value="pincée">pincée(s)</option>
                    <option value="cuillère">cuillère(s)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-natural-category uppercase tracking-wider block">Rayon / Catégorie de tri</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as any)}
                  className="w-full text-xs p-3 border border-natural-border rounded-xl bg-natural-paper focus:outline-none focus:ring-1 focus:ring-natural-sage focus:border-natural-sage focus:bg-white"
                >
                  <option value="Marché">🥬 Marché (Fruits & Légumes frais)</option>
                  <option value="Boucher">🥩 Boucher (Viandes, Volailles, Jambons)</option>
                  <option value="Fromager">🧀 Fromager (Fromages, Œufs, Beurres)</option>
                  <option value="Supermarché">🛒 Supermarché (Épiceries sèches, Crèmes fraîches)</option>
                </select>
              </div>

              <button
                type="submit"
                id="add-to-stock-btn"
                className="w-full inline-flex items-center justify-center gap-1.5 py-3 px-4 bg-natural-sage text-white font-bold text-xs rounded-2xl shadow-sm hover:bg-opacity-95 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Enregistrer dans l'inventaire
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
