import React, { useState } from 'react';
import { 
  CheckCircle2, Circle, ArrowLeft, Play, Sparkles, BookOpen, 
  Minus, Plus, RefreshCw, Layers, ChefHat, Check
} from 'lucide-react';
import { Recipe, Ingredient } from '../types';

interface KitchenPageProps {
  activeRecipe: Recipe | null;
  recipes: Recipe[];
  onBackToRecipes: () => void;
  onSelectRecipeForKitchen: (recipe: Recipe) => void;
  onCompleteCooking: (ingredientsUsed: { name: string; quantity: number; unit: string }[]) => void;
}

export default function KitchenPage({
  activeRecipe,
  recipes,
  onBackToRecipes,
  onSelectRecipeForKitchen,
  onCompleteCooking
}: KitchenPageProps) {
  // If no recipe was selected yet, let's allow them to pick one directly on this page
  const [selectedPickupId, setSelectedPickupId] = useState('');

  // Ticks for ingredients prepared
  const [preparedIngredients, setPreparedIngredients] = useState<Record<string, boolean>>({});
  
  // Track step-by-step instructions
  const [activeInstructionStep, setActiveInstructionStep] = useState<number | null>(null);

  // Parse instructions into individual bullet steps if they are formatted with numbering or carriage returns
  const getSteps = (instructions: string): string[] => {
    if (!instructions) return [];
    
    // Split on typical newlines or numbered lines
    const parsed = instructions
      .split(/\n+/)
      .map(step => step.trim())
      .filter(step => step.length > 0);
      
    return parsed;
  };

  const handleTogglePrepared = (name: string) => {
    setPreparedIngredients(prev => ({
      ...prev,
      [name]: !prev[name]
    }));
  };

  const handleFinishCookingClick = () => {
    if (!activeRecipe) return;

    if (confirm(`Avez-vous fini de cuisiner "${activeRecipe.name}" ?\n\nEn cliquant sur OK, les ingrédients requis (pour 4 personnes) seront automatiquement déduits de votre stock !`)) {
      onCompleteCooking(activeRecipe.ingredients);
      alert('Bravo ! Vos stocks ont été mis à jour.');
      onBackToRecipes();
    }
  };

  if (!activeRecipe) {
    return (
      <div className="space-y-6 text-center max-w-md mx-auto py-12" id="kitchen-page-empty">
        <ChefHat className="w-16 h-16 text-natural-accent mx-auto animate-pulse" />
        <h2 className="text-2xl font-serif font-bold text-natural-sage">Prêt à cuisiner ?</h2>
        <p className="text-sm text-natural-category leading-relaxed">
          Pour commencer, sélectionnez une recette dans votre cahier ou choisissez-en une directement ci-dessous pour l'adapter à 4 personnes.
        </p>
        
        <div className="space-y-3 pt-4">
          <select
            value={selectedPickupId}
            onChange={(e) => {
              setSelectedPickupId(e.target.value);
              const found = recipes.find(r => r.id === e.target.value);
              if (found) onSelectRecipeForKitchen(found);
            }}
            className="w-full text-xs p-3.5 border border-natural-border rounded-xl focus:outline-none focus:ring-1 focus:ring-natural-sage focus:border-natural-sage bg-white shadow-3xs font-medium"
          >
            <option value="">-- Choisissez une recette à cuisiner --</option>
            {recipes.map(r => (
              <option key={r.id} value={r.id}>🍳 {r.name}</option>
            ))}
          </select>
          
          <button
            onClick={onBackToRecipes}
            className="w-full inline-flex items-center justify-center gap-1.5 py-3 px-4 bg-[#EBEBE0] hover:bg-[#D6D6C2] text-natural-sage font-bold text-xs rounded-2xl transition-all cursor-pointer shadow-3xs"
          >
            Accéder au cahier de recettes
          </button>
        </div>
      </div>
    );
  }

  const steps = getSteps(activeRecipe.instructions);

  return (
    <div className="space-y-8" id="kitchen-page-active">
      {/* HEADER NAVIGATION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-natural-border pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToRecipes}
            className="p-2 bg-white hover:bg-natural-sage-light/25 rounded-xl border border-natural-border transition-colors cursor-pointer"
            title="Retour"
          >
            <ArrowLeft className="w-4 h-4 text-natural-sage" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-natural-accent bg-natural-highlight border border-[#D6D6C2]/50 px-2 py-0.5 rounded-full inline-block shadow-3xs">
                Mode Cuisine Actif
              </span>
              {activeRecipe.bookRef && (
                <span className="text-[10px] text-natural-category font-mono">
                  📚 {activeRecipe.bookRef}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-serif font-bold text-natural-sage mt-1">
              En cuisine : {activeRecipe.name}
            </h1>
          </div>
        </div>

        <button
          onClick={handleFinishCookingClick}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-natural-sage hover:bg-opacity-95 text-white rounded-2xl text-sm font-bold shadow-md transition-all cursor-pointer"
        >
          <Check className="w-4 h-4 text-white" />
          Préparation Terminée ! (Retirer du stock)
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT ONE COL: REQUIRED INGREDIENTS (SCALED FOR 4 PEOPLE) */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-natural-border p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-natural-border/30">
              <h3 className="font-serif font-bold text-natural-sage text-base flex items-center gap-1.5">
                <ChefHat className="w-5 h-5 text-natural-sage" />
                Ingrédients (4 Pers.)
              </h3>
              <span className="text-[11px] font-bold text-natural-category italic">Cochez pour préparer</span>
            </div>

            <div className="divide-y divide-natural-border/20">
              {activeRecipe.ingredients.map((ing, idx) => {
                const isPrepared = !!preparedIngredients[ing.name];

                return (
                  <div
                    key={idx}
                    onClick={() => handleTogglePrepared(ing.name)}
                    className="py-3.5 flex items-center justify-between gap-3 cursor-pointer select-none group"
                  >
                    <div className="flex items-center gap-2.5">
                      <button type="button" className="text-[#D6D6C2] group-hover:text-[#A68A64] transition-colors cursor-pointer">
                        {isPrepared ? (
                          <CheckCircle2 className="w-5 h-5 text-natural-sage fill-[#EBEBE0]" />
                        ) : (
                          <Circle className="w-5 h-5 text-natural-border" />
                        )}
                      </button>
                      <span className={`text-sm ${isPrepared ? 'line-through text-natural-category font-bold' : 'text-neutral-900 font-bold'}`}>
                        {ing.name}
                      </span>
                    </div>

                    <span className={`font-mono text-xs font-bold px-2.5 py-1 rounded-xl transition-colors ${
                      isPrepared ? 'bg-[#EBEBE0]/50 text-natural-category line-through' : 'bg-natural-highlight text-natural-accent border border-natural-border/40'
                    }`}>
                      {ing.quantity} {ing.unit}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-natural-highlight border border-[#D6D6C2] p-5 rounded-2xl text-xs text-[#825E35] leading-relaxed shadow-3xs">
            <span className="font-extrabold text-[#825E35] block mb-1 text-[13px]">💡 Proportion Étalon 4 Personnes</span>
            Toutes les quantités ci-dessus ont été ajustées pour correspondre exactement à votre table de 4 convives, conformément aux consignes de cuisine.
          </div>
        </div>

        {/* RIGHT TWO COLS: DETAILED STEPS OF PREPARATION */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-natural-border p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-natural-border/30">
              <h3 className="font-serif font-bold text-natural-sage text-lg flex items-center gap-1.5">
                <BookOpen className="w-5 h-5 text-natural-sage" />
                Instructions de Préparation
              </h3>
              
              <div className="flex items-center gap-1 bg-[#EBEBE0]/35 border border-natural-border p-1 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => setActiveInstructionStep(null)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    activeInstructionStep === null ? 'bg-white text-natural-sage border border-natural-border/60 shadow-3xs' : 'text-natural-category hover:text-natural-sage'
                  }`}
                >
                  Vue Globale
                </button>
                <button
                  type="button"
                  onClick={() => setActiveInstructionStep(0)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    activeInstructionStep !== null ? 'bg-white text-natural-sage border border-natural-border/60 shadow-3xs' : 'text-natural-category hover:text-natural-sage'
                  }`}
                >
                  Pas à Pas
                </button>
              </div>
            </div>

            {/* Global display mode */}
            {activeInstructionStep === null ? (
              <div className="space-y-4">
                {steps.map((step, idx) => (
                  <div key={idx} className="flex gap-4 p-3 hover:bg-natural-sage-light/10 rounded-xl transition-colors">
                    <span className="font-serif font-extrabold text-natural-accent text-lg select-none min-w-[20px] text-right">
                      {idx + 1}.
                    </span>
                    <p className="text-sm text-neutral-900 font-sans leading-relaxed whitespace-pre-wrap">
                      {step.replace(/^\d+[\.\s]*/, '') /* Strip pre-existing numbers */}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              /* Steps interactive distance reading mode (for iPad) */
              <div className="space-y-8 py-2">
                <div className="p-6 bg-natural-highlight border border-[#D6D6C2]/60 rounded-2xl min-h-[140px] flex flex-col justify-between shadow-3xs">
                  <div className="space-y-3">
                    <span className="inline-block font-sans text-[10px] font-bold uppercase tracking-widest text-natural-accent bg-white border border-natural-border/60 px-2.5 py-1 rounded-md shadow-3xs">
                      Étape {activeInstructionStep + 1} de {steps.length}
                    </span>
                    
                    <p className="font-sans text-neutral-900 text-base font-bold md:text-lg leading-relaxed whitespace-pre-wrap">
                      {steps[activeInstructionStep].replace(/^\d+[\.\s]*/, '')}
                    </p>
                  </div>
                </div>

                {/* Stepper Buttons */}
                <div className="flex items-center justify-between gap-4">
                  <button
                    onClick={() => setActiveInstructionStep(prev => prev !== null && prev > 0 ? prev - 1 : prev)}
                    disabled={activeInstructionStep === 0}
                    className="px-4 py-2 bg-[#EBEBE0] hover:bg-[#D6D6C2] border border-natural-border text-natural-sage text-xs font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    Précédent
                  </button>

                  <div className="flex items-center gap-1.5 font-mono text-xs">
                    {steps.map((_, idx) => (
                      <span 
                        key={idx}
                        onClick={() => setActiveInstructionStep(idx)}
                        className={`w-2.5 h-2.5 rounded-full cursor-pointer transition-all ${
                          idx === activeInstructionStep ? 'bg-natural-sage scale-120' : 'bg-[#D6D6C2] hover:bg-natural-border'
                        }`}
                      />
                    ))}
                  </div>

                  {activeInstructionStep < steps.length - 1 ? (
                    <button
                      onClick={() => setActiveInstructionStep(prev => prev !== null && prev < steps.length - 1 ? prev + 1 : prev)}
                      className="px-5 py-2.5 bg-natural-accent hover:bg-opacity-95 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer transition-all"
                    >
                      Suivant
                    </button>
                  ) : (
                    <button
                      onClick={handleFinishCookingClick}
                      className="px-5 py-2.5 bg-natural-sage hover:bg-opacity-95 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer transition-all"
                    >
                      C'est Cuit !
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
