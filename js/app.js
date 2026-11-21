const { createApp } = Vue;

const sb = window.sbClient || supabase;

createApp({
  data() {
    return {
      enLinea: navigator.onLine,
      cargandoInicial: true,
      enviandoLogin: false,
      correo: '',
      password: '',
      errorAuth: '',
      usuarioAuth: null,
      tipoUsuario: null, // 'docente' | 'estudiante' | null
      perfilDocente: null,
      rolesDocente: [],
      seccionesDocente: [],
      perfilEstudiante: null
    };
  },
  computed: {
    nombreMostrado() {
      if (this.tipoUsuario === 'docente' && this.perfilDocente) {
        return this.perfilDocente.nombre;
      }
      if (this.tipoUsuario === 'estudiante' && this.perfilEstudiante) {
        return `${this.perfilEstudiante.nombre} ${this.perfilEstudiante.apellido || ''}`.trim();
      }
      return this.usuarioAuth?.email || 'Usuario';
    }
  },
  async mounted() {
    window.addEventListener('online', () => { this.enLinea = true; });
    window.addEventListener('offline', () => { this.enLinea = false; });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('Error registrando Service Worker:', err);
      });
    }

    const { data } = await sb.auth.getSession();
    if (data?.session?.user) {
      this.usuarioAuth = data.session.user;
      await this.cargarPerfilYContexto(this.usuarioAuth.id);
    }
    this.cargandoInicial = false;

    sb.auth.onAuthStateChange(async (_event, session) => {
      this.usuarioAuth = session?.user || null;
      if (this.usuarioAuth) {
        await this.cargarPerfilYContexto(this.usuarioAuth.id);
      } else {
        this.limpiarContexto();
      }
    });
  },
  methods: {
    limpiarContexto() {
      this.tipoUsuario = null;
      this.perfilDocente = null;
      this.rolesDocente = [];
      this.seccionesDocente = [];
      this.perfilEstudiante = null;
    },
    async iniciarSesion() {
      this.errorAuth = '';
      this.enviandoLogin = true;

      try {
        const { data, error } = await sb.auth.signInWithPassword({
          email: this.correo,
          password: this.password
        });

        if (error) {
          this.errorAuth = 'Correo o contraseña incorrectos.';
          return;
        }

        this.usuarioAuth = data.user;
        this.password = '';
        await this.cargarPerfilYContexto(data.user.id);
      } catch (err) {
        console.error('Error inesperado en login:', err);
        this.errorAuth = 'Ocurrió un error al intentar iniciar sesión.';
      } finally {
        this.enviandoLogin = false;
      }
    },
    async cerrarSesion() {
      await sb.auth.signOut();
      this.limpiarContexto();
      this.correo = '';
      this.password = '';
    },
    async cargarPerfilYContexto(userId) {
      this.limpiarContexto();

      // 1. Verificar si es docente
      const { data: docente } = await sb
        .from('docentes')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (docente) {
        this.tipoUsuario = 'docente';
        this.perfilDocente = docente;

        const { data: roles } = await sb
          .from('asignaciones_roles')
          .select('*')
          .eq('docente_id', userId);

        this.rolesDocente = roles || [];

        const { data: secciones } = await sb
          .from('secciones')
          .select('*')
          .eq('docente_id', userId);

        this.seccionesDocente = secciones || [];
        return;
      }

      // 2. Si no es docente, verificar si es estudiante
      const { data: estudiante } = await sb
        .from('estudiantes')
        .select(`
          *,
          secciones (
            id,
            codigo_seccion,
            periodo_id
          )
        `)
        .eq('id', userId)
        .maybeSingle();

      if (estudiante) {
        this.tipoUsuario = 'estudiante';
        this.perfilEstudiante = estudiante;
      }
    }
  }
}).mount('#app');