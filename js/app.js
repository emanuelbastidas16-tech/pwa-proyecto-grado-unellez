const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    const tituloSistema = ref('Sistema de Propuestas de Grado - UNELLEZ');
    const estadoConexion = ref(navigator.onLine ? 'En línea' : 'Sin conexión');
    const usuarioPrueba = ref('Emanuel');
    const swEstado = ref('Verificando...');

    onMounted(() => {
      // Escuchar cambios de conexión en tiempo real
      window.addEventListener('online', () => (estadoConexion.value = 'En línea'));
      window.addEventListener('offline', () => (estadoConexion.value = 'Sin conexión'));

      // Registrar el Service Worker para habilitar la PWA
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .register('./sw.js')
          .then(() => {
            swEstado.value = 'Activo y listo para instalar (PWA OK)';
          })
          .catch((err) => {
            swEstado.value = 'Error al registrar SW: ' + err.message;
          });
      } else {
        swEstado.value = 'Navegador no compatible con Service Workers';
      }
    });

    return {
      tituloSistema,
      estadoConexion,
      usuarioPrueba,
      swEstado
    };
  }
}).mount('#app');