
import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Bot, User, Loader2, Plus, MessageSquare, X, 
  PanelLeftClose, PanelLeft, Lightbulb, HelpCircle, 
  FileText, Paperclip, Trash2, BookOpen, Gavel, 
  Layout, Search, Edit2, Scale, FileSignature
} from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import { ChatMessage } from '../types';
import { useChatStore } from '../hooks/useChatStore';
import { DEFAULT_COURSE_CONTENT } from '../constants';

interface TextChatProps {
  courseContent: string;
  systemInstruction: string;
  apiKey: string;
}

interface AttachedFile {
  name: string;
  data: string;
  mimeType: string;
}

export const TextChat: React.FC<TextChatProps> = ({ courseContent, systemInstruction, apiKey }) => {
  const { 
    sessions, 
    activeSessionId, 
    setActiveSessionId, 
    createNewSession, 
    deleteSession,
    renameSession,
    addMessageToSession,
    activeSession 
  } = useChatStore();

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeSession?.messages, isLoading]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') {
      if (file) alert("Veuillez sélectionner un fichier PDF.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Data = (event.target?.result as string).split(',')[1];
      setAttachedFile({ name: file.name, data: base64Data, mimeType: file.type });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const sendMessage = async (overrideInput?: string) => {
    const textToSend = overrideInput !== undefined ? overrideInput : input;
    const text = textToSend.trim();
    if ((!text && !attachedFile) || isLoading || !activeSessionId) return;

    const displayMsgText = attachedFile ? `[Fichier joint : ${attachedFile.name}]\n${text}` : text;
    addMessageToSession(activeSessionId, { role: 'user', text: displayMsgText, timestamp: new Date() });
    
    setInput('');
    const currentFile = attachedFile;
    setAttachedFile(null);
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey });
      const fullSystemInstruction = `${systemInstruction}\n\nCONTEXTE DU COURS :\n${DEFAULT_COURSE_CONTENT}`;
      
      const parts: any[] = [{ text }];
      if (currentFile) {
        parts.push({ inlineData: { data: currentFile.data, mimeType: currentFile.mimeType } });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
            ...(activeSession?.messages || []).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
            { role: 'user', parts: parts }
        ],
        config: { systemInstruction: fullSystemInstruction }
      });

      addMessageToSession(activeSessionId, {
        role: 'model',
        text: response.text || "Je n'ai pas pu formuler de réponse.",
        timestamp: new Date()
      });
    } catch (error) {
      console.error(error);
      addMessageToSession(activeSessionId, {
        role: 'model',
        text: "Une erreur est survenue lors de la communication avec l'IA.",
        timestamp: new Date(),
        isError: true
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (action: string) => {
    let prompt = "";
    switch(action) {
        case 'explication': prompt = "Explique-moi simplement la notion suivante :"; break;
        case 'dissert': prompt = "Propose-moi un sujet de dissertation et un plan détaillé (I. II.) basé sur un ou plusieurs thèmes du cours que je vais t'indiquer."; break;
        case 'fiche': prompt = "Soumets-moi un petit cas pratique sur un ou plusieurs thèmes du cours que je vais t'indiquer."; break;
        case 'glossary': prompt = "Génère un QCM de 3 questions sur un ou plusieurs thèmes du cours que je vais t'indiquer."; break;
        case 'cas': prompt = "Propose-moi 3 affirmations Vrai/Faux sur un ou plusieurs thèmes du cours que je vais t'indiquer."; break;
    }
    if (prompt) sendMessage(prompt);
  };

  const saveRename = (e: any, id: string) => {
    e.stopPropagation();
    if (renameValue.trim()) renameSession(id, renameValue.trim());
    setEditingSessionId(null);
  };

  return (
    <div className="flex h-full max-w-6xl mx-auto w-full bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden relative">
      
      {/* Sidebar Historique */}
      <div className={`absolute inset-y-0 left-0 z-30 flex flex-col w-72 bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <h3 className="font-serif font-bold text-slate-700 dark:text-slate-200">Mes Révisions</h3>
                <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg"><PanelLeftClose size={20} /></button>
            </div>
            <button onClick={() => { createNewSession(); setIsSidebarOpen(false); }} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-700 text-white rounded-lg font-medium hover:bg-blue-800 shadow-md transition-all"><Plus size={18} /><span>Nouvelle Session</span></button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sessions.map(session => (
                <div 
                  key={session.id} 
                  onClick={() => { setActiveSessionId(session.id); setIsSidebarOpen(false); }}
                  className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-all ${activeSessionId === session.id ? 'bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 font-medium' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/50'}`}
                >
                    <MessageSquare size={16} className="shrink-0" />
                    {editingSessionId === session.id ? (
                        <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveRename(e, session.id)} onBlur={e => saveRename(e, session.id)} onClick={e => e.stopPropagation()} className="flex-1 bg-slate-100 dark:bg-slate-700 px-1 rounded outline-none" />
                    ) : (
                        <span className="flex-1 truncate">{session.title}</span>
                    )}
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={e => { e.stopPropagation(); setEditingSessionId(session.id); setRenameValue(session.title); }} className="p-1 hover:text-blue-600"><Edit2 size={14} /></button>
                        <button onClick={e => deleteSession(session.id, e)} className="p-1 hover:text-red-500"><Trash2 size={14} /></button>
                    </div>
                </div>
            ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50/30 dark:bg-slate-950">
          <header className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between sticky top-0 z-10 shadow-sm">
              <div className="flex items-center gap-3">
                <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><PanelLeft size={20} /></button>
                <span className="font-serif font-bold text-slate-800 dark:text-slate-100 truncate">{activeSession?.title || 'Session de Droit'}</span>
              </div>
              <button 
                onClick={(e) => {
                    e.preventDefault();
                    setIsHelpOpen(true);
                }} 
                className="p-2 text-slate-400 hover:text-amber-500 transition-all active:scale-90" 
                title="Guide d'utilisation"
              >
                <Lightbulb size={24} />
              </button>
          </header>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {activeSession?.messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center ${msg.role === 'model' ? 'bg-blue-700 text-white shadow-md' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
                      {msg.role === 'model' ? <Scale size={20} /> : <User size={20} />}
                  </div>
                  <div className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`px-5 py-3.5 rounded-2xl shadow-sm prose prose-sm md:prose-base max-w-none ${msg.role === 'user' ? 'bg-blue-700 text-white rounded-tr-none prose-invert' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-tl-none prose-slate dark:prose-invert'}`}>
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>
                  </div>
              </div>
            ))}
            {isLoading && (
                <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center text-white"><Scale size={20} /></div>
                    <div className="bg-white dark:bg-slate-800 px-5 py-3 rounded-2xl rounded-tl-none border border-slate-200 dark:border-slate-700">
                        <Loader2 className="animate-spin text-blue-700 inline-block mr-2" size={16} />
                        <span className="text-slate-500 text-sm italic">Analyse en cours...</span>
                    </div>
                </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
            {/* BOUTONS D'ACTIONS JURIDIQUES */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2 no-scrollbar">
                <button onClick={() => handleQuickAction('explication')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 transition-all whitespace-nowrap"><Gavel size={14} /> Explication</button>
                <button onClick={() => handleQuickAction('dissert')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-100 transition-all whitespace-nowrap"><Layout size={14} /> Plan Dissertation</button>
                <button onClick={() => handleQuickAction('fiche')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 transition-all whitespace-nowrap"><FileSignature size={14} /> Cas pratique</button>
                <button onClick={() => handleQuickAction('glossary')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 transition-all whitespace-nowrap"><Search size={14} /> QCM</button>
                <button onClick={() => handleQuickAction('cas')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-lg hover:bg-rose-100 transition-all whitespace-nowrap"><BookOpen size={14} /> Vrai/Faux</button>
            </div>

            {attachedFile && (
                <div className="mb-3 flex items-center gap-3 p-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl animate-in fade-in">
                    <FileText size={20} className="text-red-500" />
                    <span className="text-xs font-bold truncate flex-1">{attachedFile.name}</span>
                    <button onClick={() => setAttachedFile(null)} className="text-slate-400 hover:text-red-500"><Trash2 size={16} /></button>
                </div>
            )}

            <div className="relative flex items-end gap-2 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-2xl border-2 border-slate-200 dark:border-slate-700 focus-within:border-blue-500/50 focus-within:ring-4 focus-within:ring-blue-500/5 transition-all">
                <button onClick={() => fileInputRef.current?.click()} className="p-3 text-slate-400 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-xl transition-all"><Paperclip size={22} /></button>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".pdf" className="hidden" />
                <textarea
                    ref={textareaRef}
                    rows={1}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
                    placeholder="Posez votre question..."
                    className="flex-1 py-3 bg-transparent !border-none outline-none shadow-none focus:ring-0 resize-none text-slate-800 dark:text-white max-h-[200px] text-sm md:text-base"                    
                />
                <button onClick={() => sendMessage()} disabled={(!input.trim() && !attachedFile) || isLoading} className="p-3 bg-blue-700 text-white rounded-xl hover:bg-blue-800 shadow-lg disabled:opacity-50 active:scale-95 transition-all"><Send size={20} /></button>
            </div>
          </div>
      </div>

      {/* MODALE D'AIDE - DÉPLACÉE ICI POUR ÊTRE TOUJOURS AU-DESSUS */}
      {isHelpOpen && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm transition-opacity">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90%] overflow-hidden border border-slate-200 dark:border-slate-700">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg">
                  <Lightbulb size={24} />
                </div>
                <h3 className="font-serif font-bold text-lg text-slate-800 dark:text-white">Guide de l'Étudiant</h3>
              </div>
              <button onClick={() => setIsHelpOpen(false)} className="text-slate-400 hover:text-slate-600 p-2 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-600 dark:text-slate-400">
              <section className="space-y-2">
                <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Paperclip size={18} className="text-blue-600" />
                  Analyse de Documents PDF
                </h4>
                <p>Utilisez le trombone pour joindre un arrêt ou un document de TD. L'IA l'analysera à la lumière des principes vus en cours magistral.</p>
              </section>

              <section className="space-y-2">
                <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Layout size={18} className="text-blue-600" />
                  Actions Juridiques Rapides
                </h4>
                <p>Les boutons au-dessus de la saisie permettent de générer des plans de dissertation, des fiches d'arrêt ou des glossaires instantanément.</p>
              </section>

              <section className="space-y-2">
                <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Edit2 size={18} className="text-blue-600" />
                  Historique Personnalisé
                </h4>
                <p>Renommez vos sessions de révision dans la barre latérale pour mieux organiser vos thématiques (ex: "Police Administrative", "Recours pour Excès de Pouvoir").</p>
              </section>
            </div>
            
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800">
              <button onClick={() => setIsHelpOpen(false)} className="w-full py-3 bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-bold shadow-md transition-all">Retourner au cours</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
