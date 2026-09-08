import React from 'react';
import { ChefHat, ShoppingBag, BookOpen, Warehouse, Sparkles } from 'lucide-react';

interface NavigationProps {
  currentTab: 'recipes' | 'shopping' | 'stocks' | 'kitchen' | 'ratatouille';
  onChangeTab: (tab: 'recipes' | 'shopping' | 'stocks' | 'kitchen' | 'ratatouille') => void;
  selectedRecipesCount: number;
  isCookingActive: boolean;
}

export default function Navigation({
  currentTab,
  onChangeTab,
  selectedRecipesCount,
  isCookingActive
}: NavigationProps) {
  return (
    <nav className="bg-natural-paper border-b border-natural-border sticky top-0 z-40 shadow-xs" id="main-navigation">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          
          {/* Brand/Logo Section */}
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => onChangeTab('recipes')}>
            <div className="w-10 h-10 rounded-xl bg-natural-sage flex items-center justify-center text-white shadow-sm">
              <ChefHat className="w-5.5 h-5.5" />
            </div>
            <div>
              <span className="font-serif italic font-bold text-natural-sage text-base leading-none block">Ma cuisine à moi</span>
              <span className="text-[9px] text-natural-category font-mono tracking-wider uppercase block">Mon Assistant Cuisine</span>
            </div>
          </div>

          {/* Nav Tabs container */}
          <div className="flex items-center gap-1 sm:gap-2">
            
            <button
              onClick={() => onChangeTab('recipes')}
              id="tab-recipes-btn"
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                currentTab === 'recipes' 
                  ? 'bg-natural-sage text-white shadow-xs' 
                  : 'text-natural-sage hover:bg-natural-sage-light/50'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">Recettes</span>
            </button>

            <button
              onClick={() => onChangeTab('shopping')}
              id="tab-shopping-btn"
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all relative cursor-pointer ${
                currentTab === 'shopping' 
                  ? 'bg-natural-sage text-white shadow-xs' 
                  : 'text-natural-sage hover:bg-natural-sage-light/50'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              <span className="hidden sm:inline">Courses</span>
              {selectedRecipesCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-natural-accent text-white rounded-full text-[10px] font-mono font-bold flex items-center justify-center shadow-3xs border border-white">
                  {selectedRecipesCount}
                </span>
              )}
            </button>

            <button
              onClick={() => onChangeTab('stocks')}
              id="tab-stocks-btn"
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                currentTab === 'stocks' 
                  ? 'bg-natural-sage text-white shadow-xs' 
                  : 'text-natural-sage hover:bg-natural-sage-light/50'
              }`}
            >
              <Warehouse className="w-4 h-4" />
              <span className="hidden sm:inline">Mon Stock</span>
            </button>

            <button
              onClick={() => onChangeTab('ratatouille')}
              id="tab-ratatouille-btn"
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                currentTab === 'ratatouille' 
                  ? 'bg-[#E39023] text-white shadow-xs' 
                  : 'text-natural-sage hover:bg-natural-sage-light/50'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-500 fill-amber-300 group-hover:scale-110" />
              <span className="hidden md:inline">Parle avec Ratatouille</span>
              <span className="md:hidden">Ratatouille</span>
            </button>

            <button
              onClick={() => onChangeTab('kitchen')}
              id="tab-kitchen-btn"
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                currentTab === 'kitchen' 
                  ? 'bg-natural-accent text-white shadow-xs' 
                  : isCookingActive 
                  ? 'text-natural-accent bg-natural-highlight border border-[#EBEBE0] animate-pulse'
                  : 'text-natural-sage hover:bg-natural-sage-light/50'
              }`}
            >
              <ChefHat className="w-4 h-4" />
              <span>En cuisine !</span>
            </button>

          </div>

        </div>
      </div>
    </nav>
  );
}
