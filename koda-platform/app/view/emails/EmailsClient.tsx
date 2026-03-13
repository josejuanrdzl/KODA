"use client";

import { useState } from 'react';

export default function EmailsClient({ data, viewToken }: { data: any, viewToken: string }) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleReadFull = async (msgId: string) => {
    setLoadingId(`read-${msgId}`);
    try {
      const res = await fetch('/api/portal/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msgId, viewToken })
      });
      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      } else {
        alert("Error al cargar el email. Es posible que el link haya expirado.");
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión");
    } finally {
      setLoadingId(null);
    }
  };

  const handleReply = async (msgId: string) => {
    setLoadingId(`reply-${msgId}`);
    try {
      const res = await fetch('/api/portal/prepare-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msgId, viewToken })
      });
      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      } else {
        alert("Error al preparar respuesta. Es posible que el link haya expirado.");
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión");
    } finally {
      setLoadingId(null);
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'urgent': return 'bg-[#EF4444]';
      case 'important': return 'bg-[#F59E0B]';
      default: return 'bg-[#475569]';
    }
  };

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Tus Correos</h1>
        <p className="text-[#94A3B8]">
          Tienes {data.total_unread} correos sin leer.
        </p>
      </div>

      <div className="space-y-4">
        {data.emails?.map((email: any) => (
          <div key={email.id} className="bg-[#1E1E2E] rounded-xl border border-[#2D2D3F] overflow-hidden flex shadow-sm">
            <div className={`w-1.5 shrink-0 ${getUrgencyColor(email.urgency)}`}></div>
            
            <div className="p-4 flex-1">
              <div className="flex justify-between items-start mb-1">
                <span className="font-medium text-gray-200">
                  {email.from_name} <span className="text-gray-500 text-sm font-normal">&lt;{email.from_email}&gt;</span>
                </span>
                <span className="text-xs text-gray-400">{email.date}</span>
              </div>
              <h3 className="font-bold text-white mb-2 text-sm">{email.subject}</h3>
              <p className="text-[#94A3B8] text-sm mb-4 line-clamp-2">
                "{email.snippet}"
              </p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => handleReadFull(email.id)}
                  disabled={!!loadingId}
                  className="bg-[#2D2D3F] hover:bg-[#3D3D52] text-white text-xs font-semibold py-2 px-4 rounded-lg transition-colors flex-1 disabled:opacity-50"
                >
                  {loadingId === `read-${email.id}` ? 'Cargando...' : 'Leer completo'}
                </button>
                <button 
                  onClick={() => handleReply(email.id)}
                  disabled={!!loadingId}
                  className="bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/30 text-xs font-semibold py-2 px-4 rounded-lg transition-colors flex-1 disabled:opacity-50"
                >
                  {loadingId === `reply-${email.id}` ? 'Preparando...' : 'Responder'}
                </button>
              </div>
            </div>
          </div>
        ))}
        {(!data.emails || data.emails.length === 0) && (
          <div className="text-center py-10 text-gray-500">
            No hay correos para mostrar.
          </div>
        )}
      </div>
    </div>
  );
}
