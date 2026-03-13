export default function SuccessPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
      <div className="w-20 h-20 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center text-4xl mb-6 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
        ✓
      </div>
      <h1 className="text-3xl font-bold text-white mb-3">
        ¡Todo Listo!
      </h1>
      <p className="text-gray-400 max-w-sm mb-10 text-lg">
        La operación se realizó con éxito. Puedes regresar a WhatsApp o Telegram para continuar hablando con KODA.
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
