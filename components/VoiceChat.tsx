
import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Phone, PhoneOff, AlertCircle } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { AudioVisualizer } from './AudioVisualizer';
import { decodeAudioData, createPcmBlob, downsampleBuffer } from '../services/audioUtils';

interface VoiceChatProps {
  courseContent: string;
  systemInstruction: string;
  apiKey: string;
}

export const VoiceChat: React.FC<VoiceChatProps> = ({ courseContent, systemInstruction, apiKey }) => {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [isMuted, setIsMuted] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } },
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
            setErrorMsg("Erreur de connexion.");
          }
        }
      });

      sessionPromiseRef.current = sessionPromise;
    } catch (err) {
      setStatus('error');
      setErrorMsg("Impossible d'initialiser l'IA.");
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
      setErrorMsg("Microphone inaccessible.");
      setStatus('error');
    }
  };

  useEffect(() => {
    return () => disconnect();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-4xl mx-auto w-full bg-slate-900 rounded-xl shadow-2xl overflow-hidden relative transition-all">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900/20 to-slate-900 pointer-events-none"></div>
      <div className="z-10 flex flex-col items-center gap-10 p-8 text-center w-full">
        <div className="space-y-2">
            <h2 className="text-3xl font-serif font-bold text-white tracking-tight">Mode Oral Direct</h2>
            <p className="text-slate-400">Posez vos questions de vive voix.</p>
        </div>
        <div className="relative">
            <AudioVisualizer level={volumeLevel} isActive={status === 'connected'} />
            <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-semibold uppercase ${
                status === 'connected' ? 'bg-green-500/20 text-green-400 border border-green-500/50' : 
                status === 'connecting' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' : 'bg-slate-700 text-slate-400 border border-slate-600'
            }`}>
                {status === 'connected' ? 'En ligne' : status === 'connecting' ? 'Connexion...' : 'Prêt'}
            </div>
        </div>
        {errorMsg && <div className="p-3 bg-red-900/50 border border-red-500/50 rounded-lg text-red-200 text-sm flex items-center gap-2"><AlertCircle size={18}/>{errorMsg}</div>}
        <div className="flex items-center gap-6">
            {status === 'connected' || status === 'connecting' ? (
                <>
                    <button onClick={() => setIsMuted(!isMuted)} className={`p-5 rounded-full ${isMuted ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-white hover:bg-slate-700'}`}>
                        {isMuted ? <MicOff size={28} /> : <Mic size={28} />}
                    </button>
                    <button onClick={disconnect} className="p-5 rounded-full bg-red-600 text-white hover:bg-red-700 shadow-xl shadow-red-600/30 transform hover:scale-105 transition-all">
                        <PhoneOff size={28} />
                    </button>
                </>
            ) : (
                <button onClick={connect} className="flex items-center gap-3 px-10 py-5 rounded-full bg-blue-600 text-white font-semibold text-lg hover:bg-blue-500 shadow-xl shadow-blue-600/20 transform hover:scale-105 active:scale-95 transition-all">
                    <Phone size={24} />
                    <span>Démarrer l'appel</span>
                </button>
            )}
        </div>
      </div>
    </div>
  );
};
