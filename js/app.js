import { supabase } from './supabase.js';

async function probarLoginDocente() {
  // 1. Iniciar sesión en Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: '**********',
    password: '**********'
  });

  console.log('Resultado Auth:', authData);
  console.log('Error Auth:', authError);

  // 2. Si inició sesión bien, consultar su perfil, roles y secciones
  if (authData?.user) {
    const { data: perfil, error: perfilError } = await supabase
      .from('docentes')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    console.log('Perfil Docente:', perfil);
    console.log('Error Perfil:', perfilError);

    const { data: roles, error: rolesError } = await supabase
      .from('asignaciones_roles')
      .select('*')
      .eq('docente_id', authData.user.id)
      .eq('periodo_id', 1);

    const { data: secciones, error: seccionesError } = await supabase
      .from('secciones')
      .select('*')
      .eq('periodo_id', 1);

    console.log('Roles en 2026-II:', roles, 'Error Roles:', rolesError);
    console.log('Secciones en 2026-II:', secciones, 'Error Secciones:', seccionesError);

    const { data: propuestas, error: propuestasError } = await supabase
      .from('propuestas')
      .select(`
        id,
        titulo,
        ronda,
        etapa_actual,
        estatus,
        a_destiempo,
        estudiantes (
          id,
          cedula,
          nombre,
          apellido,
          correo,
          secciones (
            id,
            codigo_seccion,
            periodo_id
          )
        )
      `);

    console.log('Propuestas cargadas:', propuestas, 'Error Propuestas:', propuestasError);
  }
}

//probarLoginDocente();
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