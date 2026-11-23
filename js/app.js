const { createApp } = Vue;

const sb = window.sbClient;
const MIN_PROPUESTAS_OBLIGATORIAS = 3;

function crearBorradoresIniciales() {
  return Array.from({ length: MIN_PROPUESTAS_OBLIGATORIAS }, () => ({
    titulo: '',
    descripcion: ''
  }));
}

createApp({
  data() {
    return {
      enLinea: navigator.onLine,
      cargandoSesion: true,
      cargandoAuth: false,
      validandoToken: false,
      modoAcceso: 'login', // 'login' | 'registro_docente' | 'registro_estudiante'
      seccionInvitacion: null, // { id, codigo_seccion }
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
      formRegistroEstudiante: {
        nombre: '',
        apellido: '',
        cedula: '',
        correo: '',
        password: ''
      },
      propuestasEstudiante: [],
      cargandoPropuestas: false,
      guardandoPropuesta: false,
      errorPropuesta: '',
      mensajePropuestaOk: '',
      borradoresPropuestas: crearBorradoresIniciales()
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
    },
    fechaLimiteEfectivaSeccion() {
      const sec = this.perfilEstudiante?.secciones;
      if (!sec) return null;
      return sec.fecha_prorroga || sec.fecha_limite || null;
    },
    entregaSeriaADestiempo() {
      if (!this.fechaLimiteEfectivaSeccion) return false;
      const limite = new Date(this.fechaLimiteEfectivaSeccion);
      if (Number.isNaN(limite.getTime())) return false;
      return new Date() > limite;
    },
    siguienteRondaEstudiante() {
      if (!this.propuestasEstudiante.length) return 1;
      return Math.max(...this.propuestasEstudiante.map(p => Number(p.ronda) || 1)) + 1;
    },
    puedeEnviarNuevaPropuesta() {
      if (this.cargandoPropuestas) return true;
      if (!this.propuestasEstudiante.length) return true;
      const tienePendiente = this.propuestasEstudiante.some(p => p.estatus === 'pendiente');
      const tieneAprobada = this.propuestasEstudiante.some(
        p => p.estatus === 'aprobado' || p.estatus === 'aprobado_con_modificacion'
      );
      return !tienePendiente && !tieneAprobada;
    },
    motivoBloqueoNuevaPropuesta() {
      if (this.propuestasEstudiante.some(p => p.estatus === 'pendiente')) {
        return 'Ya tienes propuestas en revisión (estatus: Pendiente). Debes esperar el resultado de la evaluación antes de enviar nuevas propuestas.';
      }
      if (this.propuestasEstudiante.some(p => p.estatus === 'aprobado' || p.estatus === 'aprobado_con_modificacion')) {
        return '¡Felicitaciones! Ya cuentas con una propuesta aprobada, por lo que no necesitas enviar nuevas propuestas.';
      }
      return '';
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
    limpiarParametroTokenUrl() {
      const urlLimpia = `${window.location.origin}${window.location.pathname}`;
      window.history.replaceState({}, document.title, urlLimpia);
    },
    salirInvitacionEstudiante() {
      this.seccionInvitacion = null;
      this.errorAuth = '';
      this.modoAcceso = 'login';
      this.limpiarParametroTokenUrl();
    },
    agregarBloquePropuesta() {
      this.borradoresPropuestas.push({ titulo: '', descripcion: '' });
    },
    eliminarBloquePropuesta(indice) {
      if (indice < MIN_PROPUESTAS_OBLIGATORIAS) return;
      this.borradoresPropuestas.splice(indice, 1);
    },
    formatearFecha(fechaIso) {
      if (!fechaIso) return '';
      const d = new Date(fechaIso);
      if (Number.isNaN(d.getTime())) return fechaIso;
      return d.toLocaleString('es-VE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    },
    textoEstatus(estatus) {
      const mapa = {
        pendiente: 'Pendiente de revisión',
        aprobado: 'Aprobada',
        aprobado_con_modificacion: 'Aprobada con modificación',
        rechazado: 'Rechazada'
      };
      return mapa[estatus] || estatus || 'Pendiente';
    },
    claseBadgeEstatus(estatus) {
      if (estatus === 'aprobado') return 'badge-aprobado';
      if (estatus === 'aprobado_con_modificacion') return 'badge-modificacion';
      if (estatus === 'rechazado') return 'badge-rechazado';
      return 'badge-pendiente';
    },
    textoEtapa(etapa) {
      const mapa = {
        primer_filtro: 'Primer filtro (Docente de sección)',
        comision: 'Evaluación de Comisión',
        finalizado: 'Evaluación finalizada'
      };
      return mapa[etapa] || etapa || 'Primer filtro';
    },
    async verificarTokenInvitacionUrl() {
      const params = new URLSearchParams(window.location.search);
      const token = (params.get('token') || '').trim();
      if (!token) return;

      this.modoAcceso = 'registro_estudiante';
      this.validandoToken = true;
      this.errorAuth = '';
      this.seccionInvitacion = null;

      try {
        const { data, error } = await sb.rpc('obtener_seccion_por_token', {
          p_token: token
        });

        if (error) {
          console.error('Error validando token de sección:', error);
          this.errorAuth = 'No se pudo verificar el enlace de invitación de sección.';
          return;
        }

        const seccion = Array.isArray(data) ? data[0] : data;
        if (!seccion || !seccion.id) {
          this.errorAuth = 'El enlace de invitación de sección no es válido o no existe.';
          return;
        }

        this.seccionInvitacion = seccion;
      } catch (err) {
        console.error('Error inesperado validando token:', err);
        this.errorAuth = 'Ocurrió un error al validar el enlace de sección.';
      } finally {
        this.validandoToken = false;
      }
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
        await this.verificarTokenInvitacionUrl();
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
      this.borradoresPropuestas = crearBorradoresIniciales();
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
    async registrarEstudiante() {
      this.errorAuth = '';

      if (!this.seccionInvitacion?.id) {
        this.errorAuth = 'No se detectó una sección válida para el registro.';
        return;
      }

      this.cargandoAuth = true;

      try {
        const { data: authData, error: signUpError } = await sb.auth.signUp({
          email: this.formRegistroEstudiante.correo,
          password: this.formRegistroEstudiante.password
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
          .from('estudiantes')
          .insert([{
            id: nuevoUsuario.id,
            nombre: this.formRegistroEstudiante.nombre,
            apellido: this.formRegistroEstudiante.apellido,
            cedula: this.formRegistroEstudiante.cedula,
            correo: this.formRegistroEstudiante.correo,
            seccion_id: this.seccionInvitacion.id
          }]);

        if (insertError) {
          console.error('Error guardando perfil estudiante:', insertError);
          this.errorAuth = `Error al guardar perfil de estudiante: ${insertError.message}`;
          return;
        }

        this.formRegistroEstudiante = {
          nombre: '',
          apellido: '',
          cedula: '',
          correo: '',
          password: ''
        };
        this.seccionInvitacion = null;
        this.modoAcceso = 'login';
        this.limpiarParametroTokenUrl();
        this.usuarioAuth = nuevoUsuario;
        await this.cargarPerfilYContexto(nuevoUsuario.id);
      } catch (err) {
        console.error('Error inesperado en registro estudiante:', err);
        this.errorAuth = 'Ocurrió un error inesperado durante el registro del estudiante.';
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
        .select('*, secciones(id, codigo_seccion, periodo_id, fecha_limite, fecha_prorroga)')
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
        .order('id', { ascending: true });

      if (error) {
        console.error('Error cargando propuestas del estudiante:', error);
      } else {
        this.propuestasEstudiante = data || [];
      }
      this.cargandoPropuestas = false;
    },
    async crearPropuestasEstudiante() {
      this.errorPropuesta = '';
      this.mensajePropuestaOk = '';

      if (!this.usuarioAuth?.id) return;
      if (!this.puedeEnviarNuevaPropuesta) {
        this.errorPropuesta = this.motivoBloqueoNuevaPropuesta;
        return;
      }

      for (let i = 0; i < MIN_PROPUESTAS_OBLIGATORIAS; i++) {
        const tituloOblig = (this.borradoresPropuestas[i]?.titulo || '').trim();
        const descOblig = (this.borradoresPropuestas[i]?.descripcion || '').trim();
        if (!tituloOblig || !descOblig) {
          this.errorPropuesta = `Debes completar obligatoriamente el título y la descripción de las 3 propuestas (revisa la Propuesta ${i + 1}).`;
          return;
        }
      }

      const propuestasCompletas = [];
      for (let i = 0; i < this.borradoresPropuestas.length; i++) {
        const titulo = (this.borradoresPropuestas[i].titulo || '').trim();
        const descripcion = (this.borradoresPropuestas[i].descripcion || '').trim();

        if (!titulo || !descripcion) {
          this.errorPropuesta = `En la Propuesta ${i + 1} debes completar tanto el título como la descripción.`;
          return;
        }

        propuestasCompletas.push({
          estudiante_id: this.usuarioAuth.id,
          titulo,
          descripcion,
          ronda: this.siguienteRondaEstudiante,
          etapa_actual: 'primer_filtro',
          estatus: 'pendiente',
          a_destiempo: this.entregaSeriaADestiempo
        });
      }

      this.guardandoPropuesta = true;
      try {
        const { error } = await sb
          .from('propuestas')
          .insert(propuestasCompletas);

        if (error) {
          console.error('Error al guardar propuestas:', error);
          this.errorPropuesta = `No se pudieron guardar las propuestas: ${error.message}`;
          return;
        }

        this.borradoresPropuestas = crearBorradoresIniciales();
        this.mensajePropuestaOk = `${propuestasCompletas.length} propuestas registradas correctamente.`;
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