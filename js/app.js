const { createApp } = Vue;

const sb = window.sbClient;

createApp({
  data() {
    return {
      enLinea: navigator.onLine,
      cargandoSesion: true,
      cargandoAuth: false,
      modoAcceso: 'login',
      usuarioAuth: null,
      tipoUsuario: null, // 'docente' | 'estudiante' | null
      perfilDocente: null,
      perfilEstudiante: null,
      rolesDocente: [],
      seccionesDocente: [],
      errorAuth: '',
      errorPerfil: '',
      formLogin: {
        correo: '',
        password: ''
      },
      nuevoTituloDocente: '',
      formRegistroDocente: {
        nombre: '',
        apellido: '',
        cedula: '',
        titulos_academicos: [],
        correo: '',
        password: ''
      },
      propuestasEstudiante: [],
      cargandoPropuestas: false,
      guardandoPropuesta: false,
      errorPropuesta: '',
      mensajePropuestaOk: '',
      nuevaPropuesta: {
        titulo: '',
        descripcion: ''
      }
    };
  },
  computed: {
    nombreUsuario() {
      if (this.tipoUsuario === 'docente' && this.perfilDocente) {
        return `${this.perfilDocente.nombre || ''} ${this.perfilDocente.apellido || ''}`.trim() || this.usuarioAuth?.email;
      }
      if (this.tipoUsuario === 'estudiante' && this.perfilEstudiante) {
        return `${this.perfilEstudiante.nombre || ''} ${this.perfilEstudiante.apellido || ''}`.trim() || this.usuarioAuth?.email;
      }
      return this.usuarioAuth?.email || 'Usuario';
    }
  },
  mounted() {
    window.addEventListener('online', this.actualizarEstadoConexion);
    window.addEventListener('offline', this.actualizarEstadoConexion);

    this.inicializarAuth();
  },
  beforeUnmount() {
    window.removeEventListener('online', this.actualizarEstadoConexion);
    window.removeEventListener('offline', this.actualizarEstadoConexion);
  },
  methods: {
    actualizarEstadoConexion() {
      this.enLinea = navigator.onLine;
    },
    cambiarModoAcceso(modo) {
      this.modoAcceso = modo;
      this.errorAuth = '';
    },
    agregarTituloDocente() {
      const titulo = (this.nuevoTituloDocente || '').trim();
      if (!titulo) return;
      if (!this.formRegistroDocente.titulos_academicos.includes(titulo)) {
        this.formRegistroDocente.titulos_academicos.push(titulo);
      }
      this.nuevoTituloDocente = '';
    },
    eliminarTituloDocente(indice) {
      this.formRegistroDocente.titulos_academicos.splice(indice, 1);
    },
    async inicializarAuth() {
      if (!sb) {
        this.errorAuth = 'No se inicializó el cliente de Supabase. Revisa js/supabase.js.';
        this.cargandoSesion = false;
        return;
      }

      const { data, error } = await sb.auth.getSession();
      if (error) {
        console.error('Error obteniendo sesión inicial:', error);
      }

      const sesionActual = data?.session || null;
      this.usuarioAuth = sesionActual?.user || null;

      if (this.usuarioAuth) {
        await this.cargarPerfilYContexto(this.usuarioAuth.id);
      } else {
        this.limpiarContexto();
      }

      this.cargandoSesion = false;

      sb.auth.onAuthStateChange(async (_event, session) => {
        this.usuarioAuth = session?.user || null;
        if (this.usuarioAuth) {
          await this.cargarPerfilYContexto(this.usuarioAuth.id);
        } else {
          this.limpiarContexto();
        }
      });
    },
    limpiarContexto() {
      this.tipoUsuario = null;
      this.perfilDocente = null;
      this.perfilEstudiante = null;
      this.rolesDocente = [];
      this.seccionesDocente = [];
      this.errorPerfil = '';
      this.propuestasEstudiante = [];
      this.errorPropuesta = '';
      this.mensajePropuestaOk = '';
    },
    async iniciarSesion() {
      this.errorAuth = '';
      this.cargandoAuth = true;

      try {
        const { data, error } = await sb.auth.signInWithPassword({
          email: this.formLogin.correo,
          password: this.formLogin.password
        });

        if (error) {
          this.errorAuth = 'Correo o contraseña incorrectos.';
          return;
        }

        this.usuarioAuth = data.user;
        this.formLogin.password = '';
        await this.cargarPerfilYContexto(this.usuarioAuth.id);
      } catch (err) {
        console.error('Error inesperado en login:', err);
        this.errorAuth = 'Ocurrió un error inesperado al iniciar sesión.';
      } finally {
        this.cargandoAuth = false;
      }
    },
    async registrarDocente() {
      this.errorAuth = '';
      this.cargandoAuth = true;

      try {
        this.agregarTituloDocente();

        if (this.formRegistroDocente.titulos_academicos.length === 0) {
          this.errorAuth = 'Debes ingresar al menos un título académico para registrarte.';
          return;
        }

        const { data: authData, error: signUpError } = await sb.auth.signUp({
          email: this.formRegistroDocente.correo,
          password: this.formRegistroDocente.password
        });

        if (signUpError) {
          this.errorAuth = `No se pudo crear la cuenta: ${signUpError.message}`;
          return;
        }

        const nuevoUsuario = authData?.user;
        const sesionActiva = authData?.session;

        if (!nuevoUsuario || !sesionActiva) {
          this.errorAuth =
            'Cuenta creada, pero no se inició sesión automáticamente. Revisa la configuración de correo en Supabase Auth.';
          return;
        }

        const { error: insertError } = await sb
          .from('docentes')
          .insert([{
            id: nuevoUsuario.id,
            cedula: this.formRegistroDocente.cedula,
            nombre: this.formRegistroDocente.nombre,
            apellido: this.formRegistroDocente.apellido,
            titulos_academicos: this.formRegistroDocente.titulos_academicos,
            correo: this.formRegistroDocente.correo,
            es_superusuario: false
          }]);

        if (insertError) {
          console.error('Error guardando perfil docente:', insertError);
          this.errorAuth = `Error al guardar perfil de docente: ${insertError.message}`;
          return;
        }

        this.nuevoTituloDocente = '';
        this.formRegistroDocente = {
          nombre: '',
          apellido: '',
          cedula: '',
          titulos_academicos: [],
          correo: '',
          password: ''
        };
        this.modoAcceso = 'login';
        this.usuarioAuth = nuevoUsuario;
        await this.cargarPerfilYContexto(nuevoUsuario.id);
      } catch (err) {
        console.error('Error inesperado en registro docente:', err);
        this.errorAuth = 'Ocurrió un error inesperado durante el registro.';
      } finally {
        this.cargandoAuth = false;
      }
    },
    async cargarPerfilYContexto(userId) {
      this.errorPerfil = '';
      this.tipoUsuario = null;
      this.perfilDocente = null;
      this.perfilEstudiante = null;
      this.rolesDocente = [];
      this.seccionesDocente = [];
      this.propuestasEstudiante = [];

      // 1. Verificar si el usuario es docente
      const { data: docente, error: errDocente } = await sb
        .from('docentes')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (errDocente) {
        console.error('Error consultando docentes:', errDocente);
        this.errorPerfil = 'Error al consultar el perfil de docente.';
        return;
      }

      if (docente) {
        this.tipoUsuario = 'docente';
        this.perfilDocente = docente;

        const { data: roles, error: errRoles } = await sb
          .from('asignaciones_roles')
          .select('*')
          .eq('docente_id', userId);

        if (errRoles) {
          console.error('Error consultando asignaciones_roles:', errRoles);
        } else {
          this.rolesDocente = roles || [];
        }

        const { data: secciones, error: errSecciones } = await sb
          .from('secciones')
          .select('*')
          .eq('docente_id', userId);

        if (errSecciones) {
          console.error('Error consultando secciones:', errSecciones);
        } else {
          this.seccionesDocente = secciones || [];
        }

        return;
      }

      // 2. Si no es docente, verificar si es estudiante
      const { data: estudiante, error: errEstudiante } = await sb
        .from('estudiantes')
        .select('*, secciones(id, codigo_seccion, periodo_id)')
        .eq('id', userId)
        .maybeSingle();

      if (errEstudiante) {
        console.error('Error consultando estudiantes:', errEstudiante);
        this.errorPerfil = 'Error al consultar el perfil de estudiante.';
        return;
      }

      if (estudiante) {
        this.tipoUsuario = 'estudiante';
        this.perfilEstudiante = estudiante;
        await this.cargarPropuestasEstudiante(userId);
        return;
      }

      this.tipoUsuario = null;
    },
    async cargarPropuestasEstudiante(estudianteId) {
      this.cargandoPropuestas = true;
      const { data, error } = await sb
        .from('propuestas')
        .select('*')
        .eq('estudiante_id', estudianteId)
        .order('id', { ascending: false });

      if (error) {
        console.error('Error cargando propuestas del estudiante:', error);
      } else {
        this.propuestasEstudiante = data || [];
      }
      this.cargandoPropuestas = false;
    },
    async crearPropuestaEstudiante() {
      this.errorPropuesta = '';
      this.mensajePropuestaOk = '';

      if (!this.usuarioAuth?.id) return;

      this.guardandoPropuesta = true;
      try {
        const siguienteRonda = this.propuestasEstudiante.length > 0
          ? Math.max(...this.propuestasEstudiante.map(p => Number(p.ronda) || 1)) + 1
          : 1;

        const { error } = await sb
          .from('propuestas')
          .insert([{
            estudiante_id: this.usuarioAuth.id,
            titulo: this.nuevaPropuesta.titulo,
            descripcion: this.nuevaPropuesta.descripcion,
            ronda: siguienteRonda,
            etapa_actual: 'primer_filtro',
            estatus: 'pendiente',
            a_destiempo: false
          }]);

        if (error) {
          console.error('Error al guardar propuesta:', error);
          this.errorPropuesta = `No se pudo guardar la propuesta: ${error.message}`;
          return;
        }

        this.nuevaPropuesta.titulo = '';
        this.nuevaPropuesta.descripcion = '';
        this.mensajePropuestaOk = 'Propuesta registrada correctamente.';
        await this.cargarPropuestasEstudiante(this.usuarioAuth.id);
      } finally {
        this.guardandoPropuesta = false;
      }
    },
    async cerrarSesion() {
      if (!sb) return;
      const { error } = await sb.auth.signOut();
      if (error) {
        console.error('Error al cerrar sesión:', error);
      }
      this.usuarioAuth = null;
      this.limpiarContexto();
    }
  }
}).mount('#app');