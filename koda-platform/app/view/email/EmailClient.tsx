"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function EmailClient({ data, viewToken }: { data: any, viewToken: string }) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [isRead, setIsRead] = useState(false);

  const handleMarkRead = async () => {
    if (isRead) return;
    setLoadingAction('read');
    try {
      const res = await fetch('/api/portal/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: data.messageId, viewToken })
      });
      const json = await res.json();
      if (json.success) {
        setIsRead(true);
      } else {
        alert("No se pudo marcar como leído.");
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleReply = async () => {
    setLoadingAction('reply');
    try {
      const res = await fetch('/api/portal/prepare-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msgId: data.messageId, viewToken })
      });
      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      } else {
        alert("Error al preparar respuesta.");
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión");
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      <div className="mb-4 text-sm font-medium text-gray-400">
        De: <span className="text-gray-200">{data.from_name}</span> &lt;{data.from_email}&gt;
        <br />
        <span className="text-xs text-gray-500">{data.date}</span>
      </div>
      
      <h1 className="text-2xl md:text-3xl font-bold text-white mb-6 leading-tight">
        {data.subject}
      </h1>
      
      <hr className="border-[#2D2D3F]" />

      <div className="bg-[#1E1E2E] rounded-xl p-5 border border-[#2D2D3F] shadow-sm overflow-x-auto">
        {data.body_html ? (
          <div 
            className="prose prose-invert max-w-none text-gray-300 prose-a:text-blue-400"
            dangerouslySetInnerHTML={{ __html: data.body_html }}
          />
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-gray-300">
            {data.body_text}
          </pre>
        )}
      </div>

      {/* Flotante Botones */}
      <div className="fixed bottom-16 left-0 right-0 p-4 bg-gradient-to-t from-[#0F0F1A] via-[#0F0F1A]/90 to-transparent pointer-events-none z-30 flex justify-center">
        <div className="flex gap-3 pointer-events-auto max-w-md w-full mx-auto">
          <button 
            onClick={() => router.back()}
            className="bg-[#2D2D3F] hover:bg-[#3D3D52] text-white font-medium py-3 px-4 rounded-xl shadow-lg transition-colors flex-1"
          >
            ← Volver
          </button>
          
          <button 
            onClick={handleMarkRead}
            disabled={isRead || loadingAction === 'read'}
            className={`${isRead ? 'bg-green-600/20 text-green-400 border border-green-500/30' : 'bg-[#2D2D3F] hover:bg-[#3D3D52] text-white'} font-medium py-3 px-4 rounded-xl shadow-lg transition-colors flex-1 disabled:opacity-75`}
          >
            {loadingAction === 'read' ? 'Marcando...' : isRead ? '✓ Leído' : 'Marcar leído'}
          </button>

          <button 
            onClick={handleReply}
            disabled={loadingAction === 'reply'}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-xl shadow-lg transition-colors flex-1 shadow-blue-900/20"
          >
            {loadingAction === 'reply' ? 'Cargando...' : 'Responder'}
          </button>
        </div>
      </div>
    </div>
  );
}
