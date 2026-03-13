"use client";

import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  location?: string;
  url?: string;
}

export default function AgendaClient({ data }: { data: any }) {
  const dateStr = data.date || new Date().toISOString();
  const events: CalendarEvent[] = data.events || [];
  
  const parsedDate = parseISO(dateStr);
  
  return (
    <div className="space-y-6 pb-12 h-min flex flex-col">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
          Tu Agenda
        </h1>
        <p className="text-[#94A3B8] text-lg font-medium capitalize">
          {format(parsedDate, "EEEE, d 'de' MMMM", { locale: es })}
        </p>
      </div>
      
      {events.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 bg-[#1E1E2E] rounded-2xl border border-[#2D2D3F] border-dashed">
          <div className="w-16 h-16 bg-[#2D2D3F] text-gray-400 rounded-full flex items-center justify-center text-2xl mb-4">
            🗓️
          </div>
          <p className="text-[#94A3B8] text-center max-w-xs">
            No tienes eventos programados para este día.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((evt, idx) => {
            const startStr = format(parseISO(evt.start), 'HH:mm');
            const endStr = evt.end ? format(parseISO(evt.end), 'HH:mm') : '';
            
            return (
              <div 
                key={idx} 
                className="bg-[#1E1E2E] p-4 rounded-2xl border border-[#2D2D3F] hover:border-blue-500/30 transition-colors flex flex-col sm:flex-row gap-4 group relative overflow-hidden shadow-sm shadow-blue-900/5"
              >
                {/* Event indicator bar */}
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-l-2xl opacity-50 group-hover:opacity-100 transition-opacity"></div>
                
                <div className="flex-shrink-0 flex sm:flex-col items-center sm:items-start gap-2 sm:gap-0 mt-1 sm:w-20 pl-3">
                  <span className="text-white font-semibold text-lg">{startStr}</span>
                  {endStr && <span className="text-[#94A3B8] text-sm">{endStr}</span>}
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-medium text-lg leading-snug mb-2">{evt.title || 'Sin título'}</h3>
                  
                  {evt.location && (
                    <div className="flex items-start text-[#94A3B8] text-sm mt-1 gap-1.5">
                      <span className="mt-0.5">📍</span>
                      <span className="truncate">{evt.location}</span>
                    </div>
                  )}
                  
                  {evt.url && (
                    <a 
                      href={evt.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors mt-3 py-1 px-3 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg"
                    >
                      Unirse a la llamada →
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      
      {/* Bottom padding for fixed buttons if any */}
      <div className="h-6"></div>
      
      {/* Footer/Close Button area - Optional but good for UX */}
      <div className="flex justify-center mt-auto pt-6 border-t border-[#2D2D3F]/50">
          <button 
            onClick={() => window.close()}
            className="text-[#94A3B8] hover:text-white transition-colors text-sm font-medium py-2 px-4 rounded-lg hover:bg-[#2D2D3F]"
          >
            Cerrar ventana
          </button>
      </div>
    </div>
  );
}
