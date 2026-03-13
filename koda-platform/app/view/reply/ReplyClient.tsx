"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ReplyClient({ data, actionToken }: { data: any, actionToken: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState(data.draft || "");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSend = async () => {
    if (!draft.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/portal/send-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionToken, body: draft })
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(true);
      } else {
        alert("Error al enviar la respuesta.");
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center text-3xl mb-6">
          ✓
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Respuesta enviada</h2>
        <p className="text-gray-400 max-w-sm mb-8">
          Tu mensaje para {data.to_name} ha sido enviado exitosamente a través de KODA.
        </p>
        <button 
          onClick={() => window.close()}
          className="bg-[#2D2D3F] hover:bg-[#3D3D52] text-white font-medium py-3 px-6 rounded-xl transition-colors"
        >
          Cerrar pestaña
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 flex flex-col h-full">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">
          Respondiendo a {data.to_name}
        </h1>
        <p className="text-[#94A3B8] text-sm truncate">
          Re: {data.subject}
        </p>
      </div>
      
      <div className="flex-1 flex flex-col bg-[#1E1E2E] rounded-xl border border-[#2D2D3F] shadow-sm overflow-hidden min-h-[40vh]">
        <div className="p-3 border-b border-[#2D2D3F] bg-[#222233]">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Borrador de KODA
          </span>
        </div>
        <textarea 
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="flex-1 w-full bg-transparent p-4 text-gray-200 focus:outline-none resize-none"
          placeholder="Escribe tu respuesta aquí..."
        />
      </div>

      {/* Flotante Botones */}
      <div className="fixed bottom-16 left-0 right-0 p-4 bg-gradient-to-t from-[#0F0F1A] via-[#0F0F1A]/90 to-transparent pointer-events-none z-30 flex justify-center">
        <div className="flex gap-3 pointer-events-auto max-w-md w-full mx-auto">
          <button 
            onClick={() => router.back()}
            disabled={loading}
            className="bg-[#2D2D3F] hover:bg-[#3D3D52] text-white font-medium py-3 px-4 rounded-xl shadow-lg transition-colors flex-[0.8] disabled:opacity-50"
          >
            Cancelar
          </button>
          
          <button 
            onClick={handleSend}
            disabled={loading || !draft.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-xl shadow-lg transition-colors flex-[1.2] shadow-blue-900/20 disabled:opacity-50 flex justify-center items-center"
          >
            {loading ? (
              <span className="animate-pulse">Enviando...</span>
            ) : (
              <span>Enviar respuesta →</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
