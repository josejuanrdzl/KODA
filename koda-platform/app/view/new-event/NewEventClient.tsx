"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewEventClient({ data, actionToken }: { data: any, actionToken: string }) {
  const router = useRouter();
  
  // Extract initial values from data if provided by the LLM
  const [title, setTitle] = useState(data.defaultSummary || "");
  const [date, setDate] = useState(data.defaultDate || new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState(data.defaultTime || "10:00");
  const [endTime, setEndTime] = useState(data.defaultEndTime || "11:00");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date || !startTime || !endTime) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/portal/create-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          actionToken, 
          eventData: { title, date, startTime, endTime } 
        })
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(true);
      } else {
        alert("Error al guardar evento.");
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
        <h2 className="text-2xl font-bold text-white mb-2">Evento Creado</h2>
        <p className="text-gray-400 max-w-sm mb-8">
          "{title}" ha sido agendado exitosamente. KODA te recordará antes de que empiece.
        </p>
        <button 
          onClick={() => window.close()}
          className="bg-[#2D2D3F] hover:bg-[#3D3D52] text-white font-medium py-3 px-6 rounded-xl transition-colors"
        >
          Cerrar ventana
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">
          Nuevo Evento
        </h1>
        <p className="text-[#94A3B8] text-sm">
          Añadir evento a tu calendario de Google
        </p>
      </div>
      
      <form onSubmit={handleSave} className="space-y-5 bg-[#1E1E2E] rounded-2xl p-5 border border-[#2D2D3F]">
        
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5 ml-1">Título del evento</label>
          <input 
            type="text" 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full bg-[#0F0F1A] border border-[#2D2D3F] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="Ej: Reunión de equipo"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5 ml-1">Fecha</label>
          <input 
            type="date" 
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="w-full bg-[#0F0F1A] border border-[#2D2D3F] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors [color-scheme:dark]"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5 ml-1">Inicio</label>
            <input 
              type="time" 
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
              className="w-full bg-[#0F0F1A] border border-[#2D2D3F] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5 ml-1">Fin</label>
            <input 
              type="time" 
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
              className="w-full bg-[#0F0F1A] border border-[#2D2D3F] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors [color-scheme:dark]"
            />
          </div>
        </div>
      </form>

      {/* Flotante Botones */}
      <div className="fixed bottom-16 left-0 right-0 p-4 bg-gradient-to-t from-[#0F0F1A] via-[#0F0F1A]/90 to-transparent pointer-events-none z-30 flex justify-center">
        <div className="flex gap-3 pointer-events-auto max-w-md w-full mx-auto">
          <button 
            type="button"
            onClick={() => router.back()}
            disabled={loading}
            className="bg-[#2D2D3F] hover:bg-[#3D3D52] text-white font-medium py-3 px-4 rounded-xl shadow-lg transition-colors flex-[0.8] disabled:opacity-50"
          >
            Cancelar
          </button>
          
          <button 
            onClick={handleSave}
            disabled={loading || !title.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-xl shadow-lg transition-colors flex-[1.2] shadow-blue-900/20 disabled:opacity-50 flex justify-center items-center"
          >
            {loading ? (
              <span className="animate-pulse">Guardando...</span>
            ) : (
              <span>Guardar Evento →</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
