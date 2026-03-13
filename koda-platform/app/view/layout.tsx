import React, { Suspense } from 'react';
import PortalLayoutClient from './PortalLayoutClient';

export default function ViewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0F0F1A] text-[#F1F5F9] font-sans flex flex-col">
      {/* Header Fijo */}
      <header className="sticky top-0 z-50 bg-[#0F0F1A]/90 backdrop-blur-md border-b border-[#2D2D3F] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg">
            K
          </div>
          <span className="font-semibold tracking-wide text-sm text-gray-200">KODA · Portal</span>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative max-w-3xl mx-auto w-full pb-20 p-4">
         {children}
      </main>

      {/* Footer Fijo con Client Component */}
      <Suspense fallback={null}>
        <PortalLayoutClient />
      </Suspense>
    </div>
  );
}
