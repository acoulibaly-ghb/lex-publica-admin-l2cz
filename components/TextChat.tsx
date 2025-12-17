
import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Plus, MessageSquare, X, PanelLeftClose, PanelLeft, Lightbulb, HelpCircle, CheckCircle } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import { ChatMessage } from '../types';
import { useChatStore } from '../hooks/useChatStore';

interface TextChatProps {
  courseContent: string;
  systemInstruction: string;
  apiKey: string;
}

export const TextChat: React.FC<TextChatProps> = ({ courseContent, systemInstruction, apiKey }) => {
  const { 
    sessions, 
    activeSessionId, 
    setActiveSessionId, 
    createNewSession, 
    addMessageToSession,
    activeSession 
  } = useChatStore();

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeSession?.messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading || !activeSessionId) return;

    const userMsg: ChatMessage = { role: 'user', text, timestamp: new Date() };
    addMessageToSession(activeSessionId, userMsg);
    setInput('');
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey });
      const fullSystemInstruction = `${systemInstruction}\n\nCONTENU DU COURS :\n${courseContent}`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
            ...(activeSession?.messages || []).map(m => ({
                role: m.role,
                parts: [{ text: m.text }]
            })),
            { role: 'user', parts: [{ text: text }] }
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
        text: "Une erreur est survenue. Vérifiez votre connexion.",
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
        case 'explain': prompt = "Explique-moi une notion clé du cours."; break;
        case 'quiz': prompt = "Pose-moi une question de quiz sur le cours."; break;
        case 'qcm': prompt = "Propose-moi un QCM à 3 choix sur le cours."; break;
    }
    if (prompt) sendMessage(prompt);
  };

  return (
    <div className="flex h-full max-w-6xl mx-auto w-full bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden relative">
      {/* Sidebar Overlay */}
      {isSidebarOpen && <div className="absolute inset-0 bg-black/30 z-20 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />}

      {/* Sidebar */}
      <div className={`absolute inset-y-0 left-0 z-30 flex flex-col w-72 bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <h3 className="font-serif font-bold">Historique</h3>
                <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-slate-500"><PanelLeftClose size={20} /></button>
            </div>
            <button onClick={() => { createNewSession(); setIsSidebarOpen(false); }} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium"><Plus size={18} /><span>Nouveau</span></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {sessions.map(session => (
                <div key={session.id} onClick={() => { setActiveSessionId(session.id); setIsSidebarOpen(false); }} className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm cursor-pointer ${activeSessionId === session.id ? 'bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 font-medium' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/50'}`}>
                    <MessageSquare size={18} className="shrink-0" />
                    <span className="flex-1 truncate">{session.title}</span>
                </div>
            ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50 dark:bg-slate-950 relative">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shadow-sm z-10">
              <div className="flex items-center gap-3">
                <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 -ml-2 text-slate-600 dark:text-slate-300 rounded-lg"><PanelLeft size={20} /></button>
                <span className="font-semibold truncate">{activeSession?.title || 'Droit Public IA'}</span>
              </div>
              <button onClick={() => setIsHelpOpen(true)} className="p-2 text-slate-500 hover:text-amber-600"><Lightbulb size={20} /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {activeSession?.messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center ${msg.role === 'model' ? 'bg-blue-600 text-white' : 'bg-slate-300 dark:bg-slate-700'}`}>
                      {msg.role === 'model' ? <Bot size={20} /> : <User size={20} />}
                  </div>
                  <div className={`flex flex-col max-w-[90%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`px-5 py-4 rounded-2xl shadow-sm prose prose-base max-w-none ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none prose-invert' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-tl-none prose-slate dark:prose-invert'}`}>
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>
                  </div>
              </div>
            ))}
            {isLoading && (
                <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white"><Bot size={20} /></div>
                    <div className="flex items-center gap-2 bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-none border border-slate-200">
                        <Loader2 className="animate-spin text-blue-600" size={16} />
                        <span className="text-slate-500 text-sm">Réflexion...</span>
                    </div>
                </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                <button onClick={() => handleQuickAction('explain')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-cyan-700 bg-cyan-50 rounded-full whitespace-nowrap"><Lightbulb size={14} /> Explication</button>
                <button onClick={() => handleQuickAction('quiz')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-full whitespace-nowrap"><HelpCircle size={14} /> Quiz</button>
                <button onClick={() => handleQuickAction('qcm')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 rounded-full whitespace-nowrap"><CheckCircle size={14} /> QCM</button>
            </div>
            <div className="relative flex items-center">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage(input)}
                    placeholder="Posez une question..."
                    className="w-full pl-5 pr-14 py-4 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-2xl focus:outline-none focus:border-blue-600 transition-all shadow-md"
                    disabled={isLoading || !activeSessionId}
                />
                <button onClick={() => sendMessage(input)} disabled={!input.trim() || isLoading} className="absolute right-3 p-2 bg-blue-600 text-white rounded-xl disabled:opacity-50"><Send size={20} /></button>
            </div>
          </div>
      </div>
    </div>
  );
};
