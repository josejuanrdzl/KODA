"use client";

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function PortalLayoutClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get('t');
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!token) return;

    fetch(`/api/portal/ttl?t=${token}`)
      .then(res => res.json())
      .then(data => {
        if (data.seconds_remaining && data.seconds_remaining > 0) {
          setSecondsRemaining(data.seconds_remaining);
        } else {
          setExpired(true);
        }
      })
      .catch(console.error);
  }, [token]);

  useEffect(() => {
    if (secondsRemaining === null || secondsRemaining <= 0) {
      if (secondsRemaining === 0) setExpired(true);
      return;
    }

    const interval = setInterval(() => {
      setSecondsRemaining(prev => (prev && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [secondsRemaining]);

  const telegramBotUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'koda_ai_bot';

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (expired) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0F0F1A]/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">⏱</div>
        <h2 className="text-2xl font-bold text-amber-500 mb-2">Este link expiró</h2>
        <p className="text-gray-400 mb-8 max-w-sm">
          Por seguridad, los links de KODA duran 30 minutos. Vuelve al chat en Telegram y pide lo que necesites de nuevo.
        </p>
        <a 
          href={`https://t.me/${telegramBotUsername}`}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-xl transition-colors w-full max-w-xs"
        >
          Volver a Telegram
        </a>
      </div>
    );
  }

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-[#1E1E2E] border-t border-[#2D2D3F] px-4 py-3 flex items-center justify-between z-40">
      <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
        <span className="text-base">⏱</span> 
        {secondsRemaining !== null ? `Expira en ${formatTime(secondsRemaining)}` : 'Calculando...'}
      </div>
      <a 
        href={`https://t.me/${telegramBotUsername}`}
        className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
      >
        ← Volver al chat
      </a>
    </footer>
  );
}
