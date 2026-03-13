export default function ErrorPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
      <div className="w-20 h-20 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center text-4xl mb-6 shadow-[0_0_30px_rgba(239,68,68,0.3)]">
        ✕
      </div>
      <h1 className="text-3xl font-bold text-white mb-3">
        Ocurrió un error
      </h1>
      <p className="text-gray-400 max-w-sm mb-10 text-lg">
        No se pudo completar la operación. Por favor, intenta de nuevo desde la conversación con KODA.
      </p>
      <button 
        onClick={() => {
          if (typeof window !== 'undefined') window.close();
        }}
        className="bg-[#2D2D3F] hover:bg-[#3D3D52] text-white font-medium py-3 px-8 rounded-xl transition-colors"
      >
        Cerrar ventana
      </button>
    </div>
  );
}
