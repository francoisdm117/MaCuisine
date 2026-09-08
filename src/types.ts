export interface Ingredient {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: 'Marché' | 'Boucher' | 'Fromager' | 'Supermarché';
}

export interface RecipeIngredient {
  name: string;
  quantity: number; // For 4 people
  unit: string;
}

export interface Recipe {
  id: string;
  name: string;
  instructions: string;
  ingredients: RecipeIngredient[];
  portions: number; // Always set/scaled to 4
  ratingTaste?: number; // 1 to 4 stars
  ratingEase?: number; // 1 to 4 stars
  bookRef?: string; // Reference to book/page if imported
  isCustom?: boolean; // Whether imported as text or created by user
}

export interface DatabaseState {
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
