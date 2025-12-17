
import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Bot, User, Loader2, Plus, MessageSquare, X, 
  PanelLeftClose, PanelLeft, Lightbulb, HelpCircle, 
  CheckCircle, FileText, Paperclip, Trash2, Scale, 
  BookOpen, ShieldCheck, Gavel, Layout, Search, Edit2, Check
} from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import { ChatMessage } from '../types';
import { useChatStore } from '../hooks/useChatStore';

interface TextChatProps {
  courseContent: string;
  systemInstruction: string;
  apiKey: string;
}

interface AttachedFile {
  name: string;
  data: string; // base64
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
  
  // States for renaming
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
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert("Seuls les fichiers PDF sont acceptés pour l'analyse juridique.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Data = (event.target?.result as string).split(',')[1];
      setAttachedFile({
        name: file.name,
        data: base64Data,
        mimeType: file.type
      });
    };
    reader.readAsDataURL(file);
    // Reset to allow re-uploading the same file if deleted
    e.target.value = '';
  };

  const sendMessage = async (overrideInput?: string) => {
    const textToSend = overrideInput !== undefined ? overrideInput : input;
    const text = textToSend.trim();
    
    if ((!text && !attachedFile) || isLoading || !activeSessionId) return;

    const displayMsgText = attachedFile ? `[Analyse du fichier: ${attachedFile.name}]\n${text}` : text;
    const userMsg: ChatMessage = { 
        role: 'user', 
        text: displayMsgText, 
        timestamp: new Date() 
    };
    
    addMessageToSession(activeSessionId, userMsg);
    setInput('');
    const currentFile = attachedFile;
    setAttachedFile(null);
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey });
      const fullSystemInstruction = `${systemInstruction}\n\nCONTENU DU COURS MAGISTRAL :\n${courseContent}`;
      
      const parts: any[] = [];
      if (text) parts.push({ text });
      else if (currentFile) parts.push({ text: "Analyse ce document juridique." });
      
      if (currentFile) {
        parts.push({
          inlineData: {
            data: currentFile.data,
            mimeType: currentFile.mimeType
          }
        });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
            ...(activeSession?.messages || []).map(m => ({
                role: m.role,
                parts: [{ text: m.text }]
            })),
            { role: 'user', parts: parts }
        ],
        config: {
            systemInstruction: fullSystemInstruction
        }
      });

      const responseText = response.text || "Désolé, je n'ai pas pu générer de réponse.";
      
      addMessageToSession(activeSessionId, {
        role: 'model',
        text: responseText,
        timestamp: new Date()
      });

    } catch (error) {
      console.error(error);
      addMessageToSession(activeSessionId, {
        role: 'model',
        text: "Une erreur est survenue lors de l'analyse. Vérifiez que le PDF n'est pas protégé par mot de passe.",
        timestamp: new Date(),
        isError: true
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleQuickAction = (action: string) => {
    let prompt = "";
    switch(action) {
        case 'juris': prompt = "Quels sont les arrêts de principe essentiels à retenir sur ce thème ?"; break;
        case 'dissert': prompt = "Propose-moi un sujet de dissertation et un plan détaillé structuré (I/ II/) basé sur le cours."; break;
        case 'explain': prompt = "Explique-moi ce concept de manière très pédagogique avec des exemples."; break;
        case 'glossary': prompt = "Dresse un glossaire des termes juridiques clés abordés dans cette partie."; break;
        case 'quiz': prompt = "Pose-moi une question de cours difficile pour tester mon niveau."; break;
    }
    if (prompt) sendMessage(prompt);
  };

  const startRenaming = (e: React.MouseEvent, session: any) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setRenameValue(session.title);
  };

  const saveRename = (e: React.MouseEvent | React.KeyboardEvent, id: string) => {
    e.stopPropagation();
    if (renameValue.trim()) {
      renameSession(id, renameValue.trim());
    }
    setEditingSessionId(null);
  };

  return (
    <div className="flex h-full max-w-6xl mx-auto w-full bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden relative">
      
      {/* MODAL D'AIDE */}
      {isHelpOpen && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85%] overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg">
                  <Lightbulb size={24} />
                </div>
                <h3 className="font-serif font-bold text-lg">Nouvelles Fonctionnalités</h3>
              </div>
              <button onClick={() => setIsHelpOpen(false)} className="text-slate-400 hover:text-slate-600 p-2 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-600 dark:text-slate-400">
              <section>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-2">
                  <Paperclip size={18} className="text-blue-600" />
                  Analyse de PDF
                </h4>
                <p>Cliquez sur le trombone pour joindre un arrêt ou un document. L'IA l'analysera pour vous en se basant sur les principes de votre cours.</p>
              </section>

              <section>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-2">
                  <Layout size={18} className="text-blue-600" />
                  Boutons d'Actions Rapides
                </h4>
                <p>Utilisez les boutons au-dessus de la saisie pour générer instantanément des plans de dissertation, des glossaires ou extraire la jurisprudence.</p>
              </section>

              <section>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-2">
                  <Edit2 size={18} className="text-blue-600" />
                  Gestion de l'Historique
                </h4>
                <p>Dans la barre latérale, vous pouvez désormais <strong>renommer</strong> vos conversations pour mieux vous organiser ou les <strong>supprimer</strong>.</p>
              </section>
            </div>
            
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800">
              <button onClick={() => setIsHelpOpen(false)} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium shadow-md transition-all">J'ai compris</button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar Historique */}
      <div className={`absolute inset-y-0 left-0 z-30 flex flex-col w-72 bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <h3 className="font-serif font-bold">Historique</h3>
                <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors"><PanelLeftClose size={20} /></button>
            </div>
            <button onClick={() => { createNewSession(); setIsSidebarOpen(false); }} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all shadow-sm"><Plus size={18} /><span>Nouvelle session</span></button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sessions.map(session => (
                <div 
                    key={session.id} 
                    onClick={() => { setActiveSessionId(session.id); setIsSidebarOpen(false); }} 
                    className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-all ${activeSessionId === session.id ? 'bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 font-medium' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/50'}`}
                >
                    <MessageSquare size={16} className="shrink-0" />
                    
                    {editingSessionId === session.id ? (
                        <input 
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && saveRename(e, session.id)}
                            onBlur={(e) => saveRename(e as any, session.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 bg-slate-100 dark:bg-slate-700 px-1 rounded border-none outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    ) : (
                        <span className="flex-1 truncate">{session.title}</span>
                    )}

                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                            onClick={(e) => startRenaming(e, session)} 
                            className="p-1 text-slate-400 hover:text-blue-500"
                            title="Renommer"
                        >
                            <Edit2 size={14} />
                        </button>
                        <button 
                            onClick={(e) => deleteSession(session.id, e)} 
                            className="p-1 text-slate-400 hover:text-red-500"
                            title="Supprimer"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
            ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50 dark:bg-slate-950">
          <header className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between z-10 sticky top-0 shadow-sm">
              <div className="flex items-center gap-3">
                <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><PanelLeft size={20} /></button>
                <span className="font-semibold truncate text-slate-700 dark:text-slate-200">{activeSession?.title || 'Révision'}</span>
              </div>
              <button onClick={() => setIsHelpOpen(true)} className="p-2 text-slate-400 hover:text-amber-500 transition-colors" title="Aide et astuces"><Lightbulb size={22} /></button>
          </header>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {activeSession?.messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                  <div className={`flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center ${msg.role === 'model' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                      {msg.role === 'model' ? <Bot size={20} /> : <User size={20} />}
                  </div>
                  <div className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`px-5 py-4 rounded-2xl shadow-sm prose prose-sm md:prose-base max-w-none ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none prose-invert' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-tl-none prose-slate dark:prose-invert'}`}>
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>
                  </div>
              </div>
            ))}
            {isLoading && (
                <div className="flex gap-4 animate-pulse">
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white shadow-md"><Bot size={20} /></div>
                    <div className="bg-white dark:bg-slate-800 px-5 py-4 rounded-2xl rounded-tl-none border border-slate-200 dark:border-slate-700 shadow-sm">
                        <Loader2 className="animate-spin text-blue-600 inline-block mr-2" size={16} />
                        <span className="text-slate-500 text-sm">Réflexion juridique...</span>
                    </div>
                </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
            {/* BOUTONS D'ACTIONS RAPIDES */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2 no-scrollbar">
                <button onClick={() => handleQuickAction('juris')} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-100 dark:border-blue-800/50 rounded-lg hover:bg-blue-100 transition-all whitespace-nowrap shadow-sm"><Gavel size={14} /> Jurisprudence</button>
                <button onClick={() => handleQuickAction('dissert')} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800/50 rounded-lg hover:bg-indigo-100 transition-all whitespace-nowrap shadow-sm"><Layout size={14} /> Plan Dissertation</button>
                <button onClick={() => handleQuickAction('explain')} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-800/50 rounded-lg hover:bg-emerald-100 transition-all whitespace-nowrap shadow-sm"><BookOpen size={14} /> Expliquer notion</button>
                <button onClick={() => handleQuickAction('glossary')} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-700 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-100 dark:border-amber-800/50 rounded-lg hover:bg-amber-100 transition-all whitespace-nowrap shadow-sm"><Search size={14} /> Glossaire</button>
                <button onClick={() => handleQuickAction('quiz')} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-300 border border-rose-100 dark:border-rose-800/50 rounded-lg hover:bg-rose-100 transition-all whitespace-nowrap shadow-sm"><HelpCircle size={14} /> Quiz difficile</button>
            </div>

            {/* PREVIEW DU FICHIER PDF JOINT */}
            {attachedFile && (
                <div className="mb-3 flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl animate-in fade-in slide-in-from-bottom-2 shadow-sm">
                    <div className="p-2 bg-red-100 text-red-600 rounded-lg shadow-inner"><FileText size={20} /></div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate text-slate-800 dark:text-slate-200">{attachedFile.name}</p>
                        <p className="text-[10px] text-slate-500 font-medium tracking-wide">Document prêt pour analyse</p>
                    </div>
                    <button onClick={() => setAttachedFile(null)} className="p-2 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={18} /></button>
                </div>
            )}

            {/* ZONE DE SAISIE TEXTAREA AUTO-EXTENSIBLE */}
            <div className="relative flex items-end gap-2 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-2xl border-2 border-slate-200 dark:border-slate-700 focus-within:border-blue-500/50 focus-within:ring-4 focus-within:ring-blue-500/5 transition-all shadow-inner">
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-xl transition-all shrink-0"
                    title="Joindre un PDF (Jurisprudence, TD...)"
                >
                    <Paperclip size={22} />
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".pdf" className="hidden" />
                
                <textarea
                    ref={textareaRef}
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Écrivez votre question de droit public..."
                    className="flex-1 py-3 bg-transparent border-none focus:ring-0 resize-none text-slate-800 dark:text-white max-h-[200px] text-sm md:text-base placeholder:text-slate-400"
                />

                <button 
                  onClick={() => sendMessage()} 
                  disabled={(!input.trim() && !attachedFile) || isLoading} 
                  className="p-3 bg-blue-600 text-white rounded-xl disabled:opacity-50 hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/30 active:scale-95 shrink-0"
                >
                  <Send size={20} />
                </button>
            </div>
            <div className="mt-2 flex justify-center items-center gap-4 text-[10px] text-slate-400 font-medium uppercase tracking-widest">
                <span>Maj + Entrée pour saut de ligne</span>
                <span className="h-1 w-1 rounded-full bg-slate-300"></span>
                <span>Entrée pour envoyer</span>
            </div>
          </div>
      </div>
    </div>
  );
};
