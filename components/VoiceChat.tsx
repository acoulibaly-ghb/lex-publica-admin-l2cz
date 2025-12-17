
import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Phone, PhoneOff, AlertCircle, User, UserRound } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { AudioVisualizer } from './AudioVisualizer';
import { decodeAudioData, createPcmBlob } from '../services/audioUtils';

interface VoiceChatProps {
  courseContent: string;
  systemInstruction: string;
  apiKey: string;
}

type VoiceOption = 'Fenrir' | 'Kore'; // Fenrir = Masculin, Kore = Féminin

export const VoiceChat: React.FC<VoiceChatProps> = ({ courseContent, systemInstruction, apiKey }) => {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [isMuted, setIsMuted] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>('Fenrir');

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionPromiseRef = useRef<Promise<any> | null>(null);

  const fullSystemInstruction = `${systemInstruction}\n\nCONTENU DU COURS (Source Unique de Vérité) :\n${courseContent}`;

  const disconnect = () => {
    if (processorRef.current) processorRef.current.disconnect();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (inputAudioContextRef.current) inputAudioContextRef.current.close();
    if (outputAudioContextRef.current) outputAudioContextRef.current.close();

    audioSourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
    audioSourcesRef.current.clear();

    inputAudioContextRef.current = null;
    outputAudioContextRef.current = null;
    streamRef.current = null;
    processorRef.current = null;
    sessionPromiseRef.current = null;
    nextStartTimeRef.current = 0;
    
    setStatus('disconnected');
    setVolumeLevel(0);
  };

  const connect = async () => {
    if (status !== 'disconnected') return;
    setStatus('connecting');
    setErrorMsg(null);

    try {
      const ai = new GoogleGenAI({ apiKey });
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      
      outputAudioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
      outputNodeRef.current = outputAudioContextRef.current.createGain();
      outputNodeRef.current.connect(outputAudioContextRef.current.destination);

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: fullSystemInstruction,
          speechConfig: {
            voiceConfig: { 
                prebuiltVoiceConfig: { voiceName: selectedVoice } 
            },
          },
        },
        callbacks: {
          onopen: () => {
            setStatus('connected');
            startMic();
          },
          onmessage: async (message: LiveServerMessage) => {
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && outputAudioContextRef.current) {
              const ctx = outputAudioContextRef.current;
              const audioBuffer = await decodeAudioData(audioData, ctx);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputNodeRef.current!);
              
              const now = ctx.currentTime;
              if (nextStartTimeRef.current < now) nextStartTimeRef.current = now;
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              
              audioSourcesRef.current.add(source);
              source.onended = () => audioSourcesRef.current.delete(source);
            }
            if (message.serverContent?.interrupted) {
              audioSourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              audioSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onclose: () => disconnect(),
          onerror: (e) => {
            console.error(e);
            setStatus('error');
            setErrorMsg("Erreur de connexion au serveur vocal.");
          }
        }
      });

      sessionPromiseRef.current = sessionPromise;
    } catch (err) {
      setStatus('error');
      setErrorMsg("Impossible d'initialiser l'IA vocale.");
    }
  };

  const startMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      inputAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      const source = inputAudioContextRef.current.createMediaStreamSource(stream);
      const processor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        if (isMuted) return;
        const inputData = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
        setVolumeLevel(Math.min(1, Math.sqrt(sum / inputData.length) * 5));

        const pcmBlob = createPcmBlob(inputData);
        sessionPromiseRef.current?.then(session => {
          session.sendRealtimeInput({ media: pcmBlob });
        });
      };

      source.connect(processor);
      processor.connect(inputAudioContextRef.current.destination);
      processorRef.current = processor;
    } catch (err) {
      setErrorMsg("Accès au microphone refusé.");
      setStatus('error');
    }
  };

  useEffect(() => {
    return () => disconnect();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-4xl mx-auto w-full bg-slate-900 rounded-2xl shadow-2xl overflow-hidden relative transition-all border border-slate-800">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900/10 to-slate-900 pointer-events-none"></div>
      
      <div className="z-10 flex flex-col items-center gap-8 p-10 text-center w-full">
        <div className="space-y-3">
            <h2 className="text-3xl font-serif font-bold text-white tracking-tight">Colloque Vocal Direct</h2>
            <p className="text-slate-400 text-sm max-w-xs mx-auto">Interrogez votre professeur virtuel comme si vous étiez en cours particulier.</p>
        </div>

        <div className="relative">
            <AudioVisualizer level={volumeLevel} isActive={status === 'connected'} />
            <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                status === 'connected' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 animate-pulse' : 
                status === 'connecting' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50' : 'bg-slate-800 text-slate-500 border border-slate-700'
            }`}>
                {status === 'connected' ? 'Session active' : status === 'connecting' ? 'Initialisation...' : 'En attente'}
            </div>
        </div>

        {errorMsg && (
            <div className="p-4 bg-red-950/40 border border-red-500/30 rounded-xl text-red-200 text-xs flex items-center gap-3 animate-in shake duration-500">
                <AlertCircle size={18} className="shrink-0 text-red-500"/>
                {errorMsg}
            </div>
        )}

        <div className="flex flex-col items-center gap-8">
            <div className="flex items-center gap-6">
                {status === 'connected' || status === 'connecting' ? (
                    <>
                        <button 
                            onClick={() => setIsMuted(!isMuted)} 
                            className={`p-6 rounded-full transition-all active:scale-90 ${isMuted ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-slate-800 text-white hover:bg-slate-700 border border-slate-700'}`}
                            title={isMuted ? "Réactiver le micro" : "Couper le micro"}
                        >
                            {isMuted ? <MicOff size={32} /> : <Mic size={32} />}
                        </button>
                        <button 
                            onClick={disconnect} 
                            className="p-8 rounded-full bg-red-600 text-white hover:bg-red-700 shadow-2xl shadow-red-600/40 transform hover:scale-110 active:scale-95 transition-all"
                            title="Mettre fin à l'appel"
                        >
                            <PhoneOff size={36} />
                        </button>
                    </>
                ) : (
                    <button 
                        onClick={connect} 
                        className="flex items-center gap-4 px-12 py-6 rounded-full bg-blue-600 text-white font-serif font-bold text-xl hover:bg-blue-500 shadow-2xl shadow-blue-600/30 transform hover:scale-105 active:scale-95 transition-all border border-blue-400/20"
                    >
                        <Phone size={28} />
                        <span>Démarrer l'appel</span>
                    </button>
                )}
            </div>

            {/* SÉLECTEUR DE VOIX */}
            {status === 'disconnected' && (
                <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
                    <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Préférence vocale</span>
                    <div className="flex p-1 bg-slate-800/50 rounded-2xl border border-slate-700 shadow-inner">
                        <button 
                            onClick={() => setSelectedVoice('Fenrir')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${selectedVoice === 'Fenrir' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                            <User size={14} />
                            Masculine
                        </button>
                        <button 
                            onClick={() => setSelectedVoice('Kore')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${selectedVoice === 'Kore' ? 'bg-pink-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                            <UserRound size={14} />
                            Féminine
                        </button>
                    </div>
                </div>
            )}
        </div>
      </div>

      <div className="absolute bottom-6 left-6 right-6 flex justify-between items-center text-[10px] text-slate-600 font-medium tracking-tighter uppercase">
          <span>Temps de réponse : Latence faible</span>
          <span className="flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-blue-500"></div> Audio PCM 16kHz</span>
      </div>
    </div>
  );
};
