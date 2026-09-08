import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, Trash2, Loader2, ChefHat, User, ArrowRight, BookOpen, CheckCircle2, Wand2, Boxes } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Ingredient } from '../types';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  actionsExecuted?: Array<{ type: string; summary: string }>;
}

interface RatatouilleChatPageProps {
  stockIngredients: Ingredient[];
  onStockUpdated?: (newIngredients: Ingredient[]) => void;
}

const STOCK_ACTION_PROMPTS = [
  { label: "🧹 Vide mon stock", text: "Vide mon stock d'ingrédients s'il te plaît !" },
  { label: "🥚 +6 œufs et 1L de lait", text: "J'ai acheté 6 œufs et 1 litre de lait au supermarché, ajoute-les à mon stock !" },
  { label: "🥕 +1 kg de carottes", text: "Ajoute 1 kg de carottes de saison à mon stock." },
  { label: "🥩 +400g de poulet", text: "J'ai acheté 400g d'escalopes de poulet chez le boucher, ajoute-les au stock." },
  { label: "🔄 Rétablir le stock de base", text: "Réinitialise mon stock avec les ingrédients de base par défaut." }
];

const PRESET_PROMPTS = [
  { label: "🧑‍🍳 Recette avec mon stock", text: "Propose-moi une recette originale et savoureuse en utilisant principalement les ingrédients actuellement disponibles dans mon stock." },
  { label: "🥗 Idée de recette rapide", text: "Propose-moi une idée de recette saine, rapide de saison et facile pour 4 personnes." },
  { label: "🍰 Un dessert gourmand", text: "Donne-moi une idée de dessert gourmand pour 4 personnes, dis-moi ce qu'il me faut." },
  { label: "🍲 Que manger ce soir ?", text: "Inspire-moi ! Quels repas simples, réconfortants et locaux puis-je préparer avec des produits frais ?" }
];

export default function RatatouilleChatPage({ stockIngredients, onStockUpdated }: RatatouilleChatPageProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat history from localStorage on mounting
  useEffect(() => {
    const saved = localStorage.getItem('ratatouille_chat_history');
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (err) {
        console.error("Failed to parse chat history", err);
      }
    } else {
      // Welcome message
      const welcome: Message = {
        id: 'welcome',
        role: 'model',
        text: "Bonjour Chef ! Bonjour ! 🧑‍🍳✨\n\nJe suis **Ratatouille**, ton sous-chef virtuel passionné ! Avec les bons produits de notre terroir et mes astuces de cuisine, nous allons faire des merveilles !\n\n🪄 **Nouveauté :** Tu peux désormais me demander de **gérer ton stock directement par la voix ou par prompt** ! Par exemple : \n- *« Vide mon stock »*\n- *« J'ai acheté 6 œufs et 1 kg de carottes »*\n- *« J'ai utilisé 2 courgettes »*\n- *« Supprime le gruyère du stock »*\n\nOu bien me demander des idées de recettes de saison sur-mesure ! Qu'est-ce qu'on cuisine de bon aujourd'hui ? *Oh la la !*",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages([welcome]);
      localStorage.setItem('ratatouille_chat_history', JSON.stringify([welcome]));
    }
  }, []);

  // Save changes to localStorage
  const saveHistory = (newMessages: Message[]) => {
    setMessages(newMessages);
    localStorage.setItem('ratatouille_chat_history', JSON.stringify(newMessages));
  };

  // Scroll to bottom when messages list changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const handleSend = async (textToSend: string) => {
    const text = textToSend.trim();
    if (!text) return;

    setErrorMsg(null);
    setInputValue('');
    setIsSending(true);

    const userMsg: Message = {
      id: 'msg_' + Math.random().toString(36).substr(2, 9),
      role: 'user',
      text: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updatedHistory = [...messages, userMsg];
    saveHistory(updatedHistory);

    try {
      // Map history to the format expected by the Gemini API
      const apiMessages = updatedHistory.map(m => ({
        role: m.role,
        text: m.text
      }));

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages })
      });

      if (!res.ok) {
        let errMsg = "Une erreur est survenue lors de la communication de Ratatouille.";
        try {
          const contentType = res.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await res.json();
            errMsg = errorData.error || errMsg;
          } else {
            errMsg = `Le serveur a renvoyé un statut d'erreur ${res.status}.`;
          }
        } catch (e) {
          errMsg = `Le serveur a renvoyé un statut d'erreur ${res.status}.`;
        }
        throw new Error(errMsg);
      }

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error("Réponse du serveur non conforme (format attendu : JSON).");
      }

      const data = await res.json();

      if (data.stockUpdated && Array.isArray(data.updatedIngredients)) {
        onStockUpdated?.(data.updatedIngredients);
      }

      const modelMsg: Message = {
        id: 'msg_' + Math.random().toString(36).substr(2, 9),
        role: 'model',
        text: data.text || "Pardon Chef, je n'ai pas pu concevoir d'idées. Peux-tu reformuler ?",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actionsExecuted: data.actionsExecuted
      };

      saveHistory([...updatedHistory, modelMsg]);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Impossible de joindre Ratatouille. Assure-toi que la clé API Gemini est configurée.");
    } finally {
      setIsSending(false);
    }
  };

  const handleClearHistory = () => {
    if (window.confirm("Es-tu sûr d'effacer notre discussion, Chef ?")) {
      const welcome: Message = {
        id: 'welcome',
        role: 'model',
        text: "Bonjour Chef ! Me revoilà avec mon tablier bien propre ! 🧑‍🍳\n\nQue préparons-nous de succulent aujourd'hui ? Tu peux me donner tes idées ou me demander conseil !",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      saveHistory([welcome]);
      setErrorMsg(null);
    }
  };

  const clickPreset = (presetText: string) => {
    setInputValue(presetText);
  };

  const appendIngredientToPrompt = (ingName: string) => {
    setInputValue(prev => {
      const base = prev.trim();
      if (!base) return `Recette avec du ${ingName} : `;
      return `${base} ${ingName},`;
    });
  };

  // Filter out zero-quantities and select top stock ingredients for easy insertion
  const availableStock = stockIngredients.filter(i => i.quantity > 0);

  return (
    <div className="space-y-6" id="ratatouille-chat-page-container">
      
      {/* Page Title & Aesthetic Header */}
      <div className="bg-natural-sage-light border border-natural-border rounded-2xl p-6 shadow-2xs relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="absolute top-0 right-0 p-8 opacity-5 text-natural-sage">
          <ChefHat className="w-48 h-48 rotate-12" />
        </div>
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-natural-sage flex items-center justify-center text-white shadow-md border-2 border-white">
            <ChefHat className="w-8 h-8" />
          </div>
          <div>
            <h1 className="font-serif italic font-bold text-2xl md:text-3xl text-natural-sage tracking-tight">Parle avec Ratatouille</h1>
            <p className="text-xs text-natural-category font-medium mt-1">Ton génie des fourneaux à l'écoute de tes moindres envies et prêt à gérer tes stocks en direct ✨</p>
          </div>
        </div>
        <button
          onClick={handleClearHistory}
          title="Effacer le chat"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-natural-border text-xs bg-white text-natural-category hover:bg-natural-highlight hover:text-natural-accent transition-colors cursor-pointer relative z-10"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Réinitialiser la cuisine</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        
        {/* Left Column: Quick Presets & Live Stock helper */}
        <div className="lg:col-span-1 space-y-4">
          
          {/* Quick Stock Actions card */}
          <div className="bg-natural-paper border border-emerald-200/80 rounded-xl p-4 shadow-3xs space-y-3">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
              <Wand2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Gérer le stock par prompt</span>
            </h3>
            <p className="text-[10px] text-natural-category leading-relaxed">
              Ratatouille peut agir sur tes placards : vider, ajouter des courses ou ajuster les restes !
            </p>
            <div className="flex flex-wrap lg:flex-col gap-1.5">
              {STOCK_ACTION_PROMPTS.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => clickPreset(preset.text)}
                  className="text-left text-[11px] font-semibold bg-emerald-50/70 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 p-2 rounded-lg text-emerald-900 transition-all cursor-pointer truncate-2-lines max-w-full"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick recipe questions */}
          <div className="bg-natural-paper border border-natural-border rounded-xl p-4 shadow-3xs space-y-3">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-natural-sage flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-natural-accent" />
              <span>Idées de questions</span>
            </h3>
            <div className="flex flex-wrap lg:flex-col gap-2">
              {PRESET_PROMPTS.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => clickPreset(preset.text)}
                  className="text-left text-[11px] font-semibold bg-natural-sage-light/35 border border-natural-border/60 hover:bg-natural-sage-light hover:border-natural-sage p-2 rounded-lg text-natural-sage transition-all cursor-pointer truncate-2-lines max-w-full"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Stock ingredients insertion */}
          <div className="bg-natural-paper border border-natural-border rounded-xl p-4 shadow-3xs space-y-3">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-natural-category flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-natural-sage" />
              <span>Ajouter du stock</span>
            </h3>
            {availableStock.length === 0 ? (
              <p className="text-[10px] text-natural-category italic">Aucun ingrédient en stock. Demande à Ratatouille ou utilise l'onglet "Mon Stock" !</p>
            ) : (
              <div className="space-y-1.5">
                <p className="text-[10px] text-natural-category leading-relaxed">Clique sur un ingrédient pour l'intégrer à ta question :</p>
                <div className="flex flex-wrap gap-1 max-h-48 overflow-y-auto pr-1">
                  {availableStock.map(ing => (
                    <button
                      key={ing.id}
                      onClick={() => appendIngredientToPrompt(ing.name)}
                      className="text-[10px] bg-white border border-natural-border hover:border-natural-sage hover:bg-natural-sage-light px-2 py-1 rounded-md text-natural-text font-medium cursor-pointer transition-colors"
                    >
                      +{ing.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Active Dialogue Interface */}
        <div className="lg:col-span-3 flex flex-col h-[600px] bg-natural-paper border border-natural-border rounded-2xl shadow-3xs overflow-hidden">
          
          {/* Header Bar */}
          <div className="bg-[#FAF9F5] border-b border-natural-border px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="w-9 h-9 rounded-full bg-natural-sage flex items-center justify-center text-white font-serif">
                  R
                </div>
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white animate-pulse"></div>
              </div>
              <div>
                <div className="text-xs font-serif font-bold text-natural-sage flex items-center gap-1">
                  Ratatouille
                  <span className="text-[10px] font-mono font-normal bg-natural-sage-light text-natural-sage px-1.5 py-0.5 rounded">Chef IA</span>
                </div>
                <span className="text-[10px] text-natural-category block leading-none">Actif • Prêt pour le service !</span>
              </div>
            </div>
            <div className="text-[10px] font-mono text-natural-category">
              Cuisine Française Locale 🇫🇷
            </div>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-natural-bg/30">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-[85%] ${
                  msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                }`}
              >
                {/* Avatar icon */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-3xs ${
                  msg.role === 'user'
                    ? 'bg-natural-accent text-white'
                    : 'bg-natural-sage text-white'
                }`}>
                  {msg.role === 'user' ? <User className="w-4 h-4" /> : <ChefHat className="w-4 h-4" />}
                </div>

                {/* Content bubble */}
                <div className="space-y-1">
                  <div className={`rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-3xs [word-break:break-word] ${
                    msg.role === 'user'
                      ? 'bg-natural-sage text-white rounded-tr-none'
                      : 'bg-white text-natural-text border border-natural-border rounded-tl-none font-sans prose prose-sm prose-stone'
                  }`}>
                    {msg.role === 'user' ? (
                      <p className="whitespace-pre-wrap font-medium">{msg.text}</p>
                    ) : (
                      <div className="space-y-2">
                        <div className="markdown-body">
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>
                        {msg.actionsExecuted && msg.actionsExecuted.length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-natural-border/70 space-y-1.5">
                            <div className="text-[10px] font-mono font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                              <Wand2 className="w-3 h-3 text-emerald-600" />
                              <span>Action effectuée en cuisine</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {msg.actionsExecuted.map((act, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] font-semibold border border-emerald-200 shadow-3xs"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <span>{act.summary}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <span className={`text-[9px] font-mono text-natural-category block ${
                    msg.role === 'user' ? 'text-right' : 'text-left'
                  }`}>
                    {msg.timestamp}
                  </span>
                </div>
              </div>
            ))}

            {/* AI is thinking indicator */}
            {isSending && (
              <div className="flex gap-3 max-w-[80%] mr-auto">
                <div className="w-8 h-8 rounded-full bg-natural-sage text-white flex items-center justify-center shrink-0 shadow-3xs">
                  <ChefHat className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <div className="rounded-2xl rounded-tl-none bg-white p-4 shadow-3xs border border-natural-border flex items-center gap-3">
                    <Loader2 className="w-4 h-4 text-natural-sage animate-spin" />
                    <span className="text-xs text-natural-sage italic font-serif">Ratatouille inspecte les placards et prépare ses ustensiles... *oh la la*...</span>
                  </div>
                </div>
              </div>
            )}

            {/* Error notifications */}
            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-[11px] text-red-600 space-y-2 max-w-md mx-auto shadow-3xs">
                <div className="flex items-center gap-1.5 font-bold">
                  <span>⚠️ Erreur de communication</span>
                </div>
                <p>{errorMsg}</p>
                <p className="text-[10px] text-natural-category">Veuillez vérifier que l'instance Docker a bien accès à la variable d'environnement <code className="bg-red-100 px-1 py-0.5 rounded font-mono font-bold">GEMINI_API_KEY</code>.</p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input Area */}
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(inputValue); }}
            className="p-4 bg-white border-t border-natural-border flex gap-3 items-center"
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isSending}
              placeholder="Pose une question à Ratatouille, suggère des ingrédients..."
              className="flex-1 px-4 py-2.5 rounded-xl border border-natural-border bg-natural-bg/25 hover:bg-natural-bg/10 focus:bg-white focus:outline-none focus:ring-1 focus:ring-natural-sage text-xs text-natural-text transition-all disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isSending || !inputValue.trim()}
              className="px-4 py-2.5 rounded-xl bg-natural-sage hover:bg-opacity-95 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>Envoyer</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
