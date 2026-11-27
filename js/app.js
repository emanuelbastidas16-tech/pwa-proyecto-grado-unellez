const { createApp } = Vue;

const sb = window.sbClient;
const MIN_PROPUESTAS_OBLIGATORIAS = 3;

function crearBorradoresIniciales(cantidad = MIN_PROPUESTAS_OBLIGATORIAS) {
  return Array.from({ length: Math.max(1, cantidad) }, () => ({
    titulo: '',
    descripcion: ''
  }));
}

function isoToDatetimeLocal(fechaIso) {
  if (!fechaIso) return '';
  const d = new Date(fechaIso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

createApp({
  data() {
    return {
      enLinea: navigator.onLine,
      cargandoSesion: true,
      cargandoPerfil: false,
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
      fechasLimiteEdicion: {},
      editandoFechaSeccionId: null,
      guardandoFechaSeccionId: null,
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
      borradoresPropuestas: crearBorradoresIniciales(),
      propuestasPrimerFiltro: [],
      seccionSeleccionadaId: null,
      estudianteSeleccionadoId: null,
      cargandoPropuestasDocente: false,
      evaluandoPropuestaId: null,
      observacionesDocente: {},
      propuestasComision: [],
      cargandoPropuestasComision: false,
      evaluandoComisionId: null,
      observacionesComision: {},
      mostrarHistorialDocente: false,
      cargandoHistorialDocente: false,
      estudiantesHistorialDocente: [],
      estudianteHistorialSeleccionadoId: null,
      errorDocente: '',
      mensajeDocenteOk: ''
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
    esDocenteDeSeccion() {
      if (this.tipoUsuario !== 'docente') return false;
      const tieneRolSeccion = this.rolesDocente.some(
        r => r.rol === 'docente_seccion' || r.rol === 'docente'
      );
      return tieneRolSeccion || this.seccionesDocente.length > 0;
    },
    esDocenteComision() {
      if (this.tipoUsuario !== 'docente') return false;
      return this.rolesDocente.some(
        r => r.rol === 'comision' || r.rol === 'jurado' || r.rol === 'miembro_comision'
      );
    },
    seccionSeleccionadaObj() {
      if (!this.seccionSeleccionadaId) return null;
      return this.seccionesDocente.find(s => s.id === this.seccionSeleccionadaId) || null;
    },
    estudiantesConPropuestasPrimerFiltro() {
      const gruposMap = new Map();

      for (const prop of this.propuestasPrimerFiltro) {
        const key = prop.estudiante_id;
        if (!gruposMap.has(key)) {
          gruposMap.set(key, {
            estudiante_id: key,
            seccion_id: prop.seccion_id,
            nombreCompleto: prop.estudianteNombre || 'Estudiante',
            cedula: prop.estudianteCedula || '',
            codigoSeccion: prop.codigoSeccion || '',
            propuestas: []
          });
        }
        gruposMap.get(key).propuestas.push(prop);
      }

      return Array.from(gruposMap.values());
    },
    estudiantesDeSeccionSeleccionada() {
      if (!this.seccionSeleccionadaId) return [];
      return this.estudiantesConPropuestasPrimerFiltro.filter(
        est => Number(est.seccion_id) === Number(this.seccionSeleccionadaId)
      );
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
    propuestasNoRechazadasEstudiante() {
      return this.propuestasEstudiante.filter(p => p.estatus !== 'rechazado');
    },
    tienePropuestasRechazadasEstudiante() {
      return this.propuestasEstudiante.some(p => p.estatus === 'rechazado');
    },
    cupoReemplazoPropuestas() {
      if (!this.propuestasEstudiante.length) return MIN_PROPUESTAS_OBLIGATORIAS;
      const faltantesParaTres = MIN_PROPUESTAS_OBLIGATORIAS - this.propuestasNoRechazadasEstudiante.length;
      return Math.max(1, faltantesParaTres);
    },
    numeroInicialNuevaPropuesta() {
      return this.propuestasEstudiante.length + 1;
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
    construirEnlaceSeccion(token) {
      const urlBase = `${window.location.origin}${window.location.pathname}`;
      return `${urlBase}?token=${encodeURIComponent(token)}`;
    },
    construirUrlApiWhatsapp(seccion) {
      const enlace = this.construirEnlaceSeccion(seccion.token_acceso);
      const mensaje =
        `Hola, este es el enlace oficial de inscripción para la sección ${seccion.codigo_seccion} ` +
        `en el Sistema de Propuestas de Grado - UNELLEZ:\n${enlace}`;
      return `https://api.whatsapp.com/send?text=${encodeURIComponent(mensaje)}`;
    },
    enviarEnlacePorWhatsapp(seccion) {
      if (!seccion?.token_acceso) return;
      const urlWhatsapp = this.construirUrlApiWhatsapp(seccion);
      window.open(urlWhatsapp, '_blank', 'noopener,noreferrer');
    },
    alternarEdicionFechaSeccion(seccion) {
      if (this.editandoFechaSeccionId === seccion.id) {
        this.editandoFechaSeccionId = null;
      } else {
        this.fechasLimiteEdicion[seccion.id] = isoToDatetimeLocal(seccion.fecha_limite);
        this.editandoFechaSeccionId = seccion.id;
      }
    },
    async guardarFechaLimiteSeccion(seccion) {
      this.errorDocente = '';
      this.mensajeDocenteOk = '';

      const valorLocal = this.fechasLimiteEdicion[seccion.id];
      if (!valorLocal) {
        this.errorDocente = `Debes seleccionar una fecha límite para la sección ${seccion.codigo_seccion}.`;
        return;
      }

      const fechaObj = new Date(valorLocal);
      if (Number.isNaN(fechaObj.getTime())) {
        this.errorDocente = 'La fecha límite ingresada no es válida.';
        return;
      }

      this.guardandoFechaSeccionId = seccion.id;
      try {
        const fechaIso = fechaObj.toISOString();
        const { error } = await sb
          .from('secciones')
          .update({ fecha_limite: fechaIso })
          .eq('id', seccion.id);

        if (error) {
          console.error('Error actualizando fecha_limite de sección:', error);
          this.errorDocente = `No se pudo guardar la fecha límite: ${error.message}`;
          return;
        }

        seccion.fecha_limite = fechaIso;
        this.editandoFechaSeccionId = null;
        this.mensajeDocenteOk = `Fecha límite actualizada para la sección ${seccion.codigo_seccion}.`;
      } finally {
        this.guardandoFechaSeccionId = null;
      }
    },
    contarEstudiantesSeccion(seccionId) {
      return this.estudiantesConPropuestasPrimerFiltro.filter(
        est => Number(est.seccion_id) === Number(seccionId)
      ).length;
    },
    seleccionarSeccionDocente(seccionId) {
      if (Number(this.seccionSeleccionadaId) === Number(seccionId)) {
        this.seccionSeleccionadaId = null;
        this.estudianteSeleccionadoId = null;
        this.editandoFechaSeccionId = null;
      } else {
        this.seccionSeleccionadaId = seccionId;
        this.estudianteSeleccionadoId = null;
        this.editandoFechaSeccionId = null;
      }
    },
    seleccionarEstudiantePrimerFiltro(estudianteId) {
      this.estudianteSeleccionadoId =
        this.estudianteSeleccionadoId === estudianteId ? null : estudianteId;
    },
    async alternarHistorialDocente() {
      this.mostrarHistorialDocente = !this.mostrarHistorialDocente;
      this.errorDocente = '';

      if (this.mostrarHistorialDocente) {
        this.estudianteHistorialSeleccionadoId = null;
        await this.cargarHistorialTodosEstudiantesDocente();
      }
    },
    seleccionarEstudianteHistorial(estudianteId) {
      this.estudianteHistorialSeleccionadoId =
        this.estudianteHistorialSeleccionadoId === estudianteId ? null : estudianteId;
    },
    async cargarHistorialTodosEstudiantesDocente() {
      if (!this.seccionesDocente.length) {
        this.estudiantesHistorialDocente = [];
        return;
      }

      this.cargandoHistorialDocente = true;
      this.errorDocente = '';

      try {
        const mapaSecciones = {};
        this.seccionesDocente.forEach(s => {
          mapaSecciones[s.id] = s.codigo_seccion;
        });

        const idsSecciones = this.seccionesDocente.map(s => s.id);

        const { data: estudiantesSec, error: errEst } = await sb
          .from('estudiantes')
          .select('id, nombre, apellido, cedula, seccion_id')
          .in('seccion_id', idsSecciones)
          .order('apellido', { ascending: true });

        if (errEst) {
          console.error('Error consultando estudiantes para historial:', errEst);
          this.errorDocente = 'No se pudo cargar la lista de estudiantes para el historial.';
          return;
        }

        if (!estudiantesSec || estudiantesSec.length === 0) {
          this.estudiantesHistorialDocente = [];
          return;
        }

        const idsEstudiantes = estudiantesSec.map(e => e.id);

        const { data: todasPropuestas, error: errProp } = await sb
          .from('propuestas')
          .select('*')
          .in('estudiante_id', idsEstudiantes)
          .order('id', { ascending: true });

        if (errProp) {
          console.error('Error consultando propuestas para historial:', errProp);
          this.errorDocente = 'No se pudo cargar el historial de propuestas.';
          return;
        }

        const propuestasPorEstudiante = new Map();
        (todasPropuestas || []).forEach(prop => {
          if (!propuestasPorEstudiante.has(prop.estudiante_id)) {
            propuestasPorEstudiante.set(prop.estudiante_id, []);
          }
          propuestasPorEstudiante.get(prop.estudiante_id).push(prop);
        });

        this.estudiantesHistorialDocente = estudiantesSec.map(est => ({
          id: est.id,
          seccion_id: est.seccion_id,
          nombreCompleto: `${est.nombre || ''} ${est.apellido || ''}`.trim() || 'Estudiante',
          cedula: est.cedula || '',
          codigoSeccion: mapaSecciones[est.seccion_id] || ('ID ' + est.seccion_id),
          propuestas: propuestasPorEstudiante.get(est.id) || []
        }));
      } finally {
        this.cargandoHistorialDocente = false;
      }
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
      if (indice < this.cupoReemplazoPropuestas) return;
      this.borradoresPropuestas.splice(indice, 1);
    },
    prepararBorradoresEstudiante() {
      if (!this.puedeEnviarNuevaPropuesta) return;
      if (this.propuestasEstudiante.length === 0) {
        this.borradoresPropuestas = crearBorradoresIniciales(MIN_PROPUESTAS_OBLIGATORIAS);
      } else if (this.tienePropuestasRechazadasEstudiante) {
        this.borradoresPropuestas = crearBorradoresIniciales(this.cupoReemplazoPropuestas);
      }
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
        this.cargandoPerfil = true;
        await this.cargarPerfilYContexto(this.usuarioAuth.id);
      } else {
        this.limpiarContexto();
        await this.verificarTokenInvitacionUrl();
      }

      this.cargandoSesion = false;

      sb.auth.onAuthStateChange(async (event, session) => {
        const nuevoUsuario = session?.user || null;

        if (!nuevoUsuario) {
          this.usuarioAuth = null;
          this.limpiarContexto();
          return;
        }

        const mismoUsuarioYaCargado =
          this.usuarioAuth?.id === nuevoUsuario.id &&
          this.tipoUsuario !== null;

        this.usuarioAuth = nuevoUsuario;

        if (mismoUsuarioYaCargado && (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) {
          return;
        }

        if (!mismoUsuarioYaCargado) {
          this.cargandoPerfil = true;
          await this.cargarPerfilYContexto(nuevoUsuario.id);
        }
      });
    },
    limpiarContexto() {
      this.cargandoPerfil = false;
      this.tipoUsuario = null;
      this.perfilDocente = null;
      this.perfilEstudiante = null;
      this.rolesDocente = [];
      this.seccionesDocente = [];
      this.fechasLimiteEdicion = {};
      this.editandoFechaSeccionId = null;
      this.guardandoFechaSeccionId = null;
      this.errorPerfil = '';
      this.propuestasEstudiante = [];
      this.errorPropuesta = '';
      this.mensajePropuestaOk = '';
      this.borradoresPropuestas = crearBorradoresIniciales();
      this.propuestasPrimerFiltro = [];
      this.seccionSeleccionadaId = null;
      this.estudianteSeleccionadoId = null;
      this.observacionesDocente = {};
      this.propuestasComision = [];
      this.cargandoPropuestasComision = false;
      this.evaluandoComisionId = null;
      this.observacionesComision = {};
      this.mostrarHistorialDocente = false;
      this.cargandoHistorialDocente = false;
      this.estudiantesHistorialDocente = [];
      this.estudianteHistorialSeleccionadoId = null;
      this.errorDocente = '';
      this.mensajeDocenteOk = '';
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
        this.cargandoPerfil = true;
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
        this.cargandoPerfil = true;
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
        this.cargandoPerfil = true;
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
      this.cargandoPerfil = true;

      try {
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
          this.perfilEstudiante = null;

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
            .eq('docente_id', userId)
            .order('id', { ascending: true });

          if (errSecciones) {
            console.error('Error consultando secciones:', errSecciones);
          } else {
            this.seccionesDocente = secciones || [];
            const mapaFechas = {};
            this.seccionesDocente.forEach(s => {
              mapaFechas[s.id] = isoToDatetimeLocal(s.fecha_limite);
            });
            this.fechasLimiteEdicion = mapaFechas;
          }

          if (this.esDocenteDeSeccion) {
            await this.cargarPropuestasPrimerFiltroDocente();
          }

          if (this.esDocenteComision) {
            await this.cargarPropuestasComision();
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
          this.perfilDocente = null;
          await this.cargarPropuestasEstudiante(userId);
          return;
        }

        this.tipoUsuario = null;
      } finally {
        this.cargandoPerfil = false;
      }
    },
    async cargarPropuestasPrimerFiltroDocente() {
      if (!this.seccionesDocente.length) {
        this.propuestasPrimerFiltro = [];
        this.estudianteSeleccionadoId = null;
        return;
      }

      this.cargandoPropuestasDocente = true;
      this.errorDocente = '';

      try {
        const mapaSecciones = {};
        this.seccionesDocente.forEach(s => {
          mapaSecciones[s.id] = s.codigo_seccion;
        });

        const idsSecciones = this.seccionesDocente.map(s => s.id);

        const { data: estudiantesSec, error: errEst } = await sb
          .from('estudiantes')
          .select('id, nombre, apellido, cedula, seccion_id')
          .in('seccion_id', idsSecciones);

        if (errEst) {
          console.error('Error consultando estudiantes de secciones:', errEst);
          this.errorDocente = 'No se pudieron cargar los estudiantes de tus secciones.';
          return;
        }

        if (!estudiantesSec || estudiantesSec.length === 0) {
          this.propuestasPrimerFiltro = [];
          this.estudianteSeleccionadoId = null;
          return;
        }

        const mapaEstudiantes = {};
        estudiantesSec.forEach(est => {
          mapaEstudiantes[est.id] = {
            seccion_id: est.seccion_id,
            nombreCompleto: `${est.nombre || ''} ${est.apellido || ''}`.trim(),
            cedula: est.cedula,
            codigoSeccion: mapaSecciones[est.seccion_id] || ('ID ' + est.seccion_id)
          };
        });

        const idsEstudiantes = estudiantesSec.map(e => e.id);

        const { data: propuestas, error: errProp } = await sb
          .from('propuestas')
          .select('*')
          .in('estudiante_id', idsEstudiantes)
          .eq('etapa_actual', 'primer_filtro')
          .eq('estatus', 'pendiente')
          .order('id', { ascending: true });

        if (errProp) {
          console.error('Error consultando propuestas en primer filtro:', errProp);
          this.errorDocente = 'No se pudieron cargar las propuestas en primer filtro.';
          return;
        }

        this.propuestasPrimerFiltro = (propuestas || []).map(p => {
          const estInfo = mapaEstudiantes[p.estudiante_id] || {};
          if (this.observacionesDocente[p.id] === undefined) {
            this.observacionesDocente[p.id] = p.observacion_docente || '';
          }
          return {
            ...p,
            seccion_id: estInfo.seccion_id || null,
            estudianteNombre: estInfo.nombreCompleto || 'Estudiante',
            estudianteCedula: estInfo.cedula || '',
            codigoSeccion: estInfo.codigoSeccion || ''
          };
        });

        const idsEstudiantesEnSeccion = new Set(
          this.estudiantesDeSeccionSeleccionada.map(e => e.estudiante_id)
        );
        if (this.estudianteSeleccionadoId && !idsEstudiantesEnSeccion.has(this.estudianteSeleccionadoId)) {
          this.estudianteSeleccionadoId = null;
        }
      } finally {
        this.cargandoPropuestasDocente = false;
      }
    },
    async evaluarPropuestaDocente(propuesta, decision) {
      this.errorDocente = '';
      this.mensajeDocenteOk = '';

      const obs = (this.observacionesDocente[propuesta.id] || '').trim();
      if (decision === 'rechazar' && !obs) {
        this.errorDocente = 'Debes escribir el motivo del rechazo para indicarle al alumno por qué fue rechazada la propuesta.';
        return;
      }

      this.evaluandoPropuestaId = propuesta.id;
      try {
        const payload = decision === 'comision'
          ? {
              etapa_actual: 'comision',
              estatus: 'pendiente',
              observacion_docente: null,
              actualizado_en: new Date().toISOString()
            }
          : {
              estatus: 'rechazado',
              observacion_docente: obs,
              actualizado_en: new Date().toISOString()
            };

        const { error } = await sb
          .from('propuestas')
          .update(payload)
          .eq('id', propuesta.id);

        if (error) {
          console.error('Error evaluando propuesta en primer filtro:', error);
          this.errorDocente = `No se pudo actualizar la propuesta: ${error.message}`;
          return;
        }

        this.observacionesDocente[propuesta.id] = '';
        this.mensajeDocenteOk =
          decision === 'comision'
            ? `La propuesta "${propuesta.titulo}" fue enviada a Comisión.`
            : `La propuesta "${propuesta.titulo}" fue rechazada con su motivo para el alumno.`;

        await this.cargarPropuestasPrimerFiltroDocente();
        if (this.esDocenteComision) {
          await this.cargarPropuestasComision();
        }
        if (this.mostrarHistorialDocente) {
          await this.cargarHistorialTodosEstudiantesDocente();
        }
      } finally {
        this.evaluandoPropuestaId = null;
      }
    },
    async cargarPropuestasComision() {
      this.cargandoPropuestasComision = true;
      this.errorDocente = '';

      try {
        const { data: propuestas, error: errProp } = await sb
          .from('propuestas')
          .select('*')
          .eq('etapa_actual', 'comision')
          .eq('estatus', 'pendiente')
          .order('id', { ascending: true });

        if (errProp) {
          console.error('Error consultando propuestas en comisión:', errProp);
          this.errorDocente = 'No se pudieron cargar las propuestas para evaluación de comisión.';
          return;
        }

        if (!propuestas || propuestas.length === 0) {
          this.propuestasComision = [];
          return;
        }

        const idsEstudiantes = [...new Set(propuestas.map(p => p.estudiante_id))];

        const { data: estudiantesData, error: errEst } = await sb
          .from('estudiantes')
          .select('id, nombre, apellido, cedula, seccion_id')
          .in('id', idsEstudiantes);

        if (errEst) {
          console.error('Error consultando estudiantes de propuestas en comisión:', errEst);
          this.errorDocente = 'No se pudieron cargar los datos de estudiantes de comisión.';
          return;
        }

        const idsSecciones = [...new Set((estudiantesData || []).map(e => e.seccion_id).filter(Boolean))];
        let mapaSecciones = {};

        if (idsSecciones.length > 0) {
          const { data: seccionesData, error: errSec } = await sb
            .from('secciones')
            .select('id, codigo_seccion')
            .in('id', idsSecciones);

          if (!errSec && seccionesData) {
            seccionesData.forEach(s => {
              mapaSecciones[s.id] = s.codigo_seccion;
            });
          }
        }

        const mapaEstudiantes = {};
        (estudiantesData || []).forEach(est => {
          mapaEstudiantes[est.id] = {
            nombreCompleto: `${est.nombre || ''} ${est.apellido || ''}`.trim() || 'Estudiante',
            cedula: est.cedula || '',
            codigoSeccion: mapaSecciones[est.seccion_id] || (est.seccion_id ? `ID ${est.seccion_id}` : '')
          };
        });

        this.propuestasComision = propuestas.map(p => {
          const estInfo = mapaEstudiantes[p.estudiante_id] || {};
          if (this.observacionesComision[p.id] === undefined) {
            this.observacionesComision[p.id] = p.observacion_comision || '';
          }
          return {
            ...p,
            estudianteNombre: estInfo.nombreCompleto || 'Estudiante',
            estudianteCedula: estInfo.cedula || '',
            codigoSeccion: estInfo.codigoSeccion || ''
          };
        });
      } finally {
        this.cargandoPropuestasComision = false;
      }
    },
    async evaluarPropuestaComision(propuesta, estatusFinal) {
      this.errorDocente = '';
      this.mensajeDocenteOk = '';

      const obs = (this.observacionesComision[propuesta.id] || '').trim();
      if ((estatusFinal === 'aprobado_con_modificacion' || estatusFinal === 'rechazado') && !obs) {
        this.errorDocente = 'Debes registrar la observación de la comisión al aprobar con modificación o rechazar una propuesta.';
        return;
      }

      this.evaluandoComisionId = propuesta.id;
      try {
        const payload = {
          estatus: estatusFinal,
          etapa_actual: 'finalizado',
          observacion_comision: obs || null,
          actualizado_en: new Date().toISOString()
        };

        const { error } = await sb
          .from('propuestas')
          .update(payload)
          .eq('id', propuesta.id);

        if (error) {
          console.error('Error evaluando propuesta en comisión:', error);
          this.errorDocente = `No se pudo guardar el dictamen de comisión: ${error.message}`;
          return;
        }

        this.observacionesComision[propuesta.id] = '';
        this.mensajeDocenteOk = `Dictamen registrado (${this.textoEstatus(estatusFinal)}) para la propuesta "${propuesta.titulo}".`;

        await this.cargarPropuestasComision();
        if (this.mostrarHistorialDocente) {
          await this.cargarHistorialTodosEstudiantesDocente();
        }
      } finally {
        this.evaluandoComisionId = null;
      }
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
        this.prepararBorradoresEstudiante();
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

      const requeridasObligatorias = this.propuestasEstudiante.length === 0
        ? MIN_PROPUESTAS_OBLIGATORIAS
        : this.cupoReemplazoPropuestas;

      for (let i = 0; i < requeridasObligatorias; i++) {
        const tituloOblig = (this.borradoresPropuestas[i]?.titulo || '').trim();
        const descOblig = (this.borradoresPropuestas[i]?.descripcion || '').trim();
        const numeroProp = this.numeroInicialNuevaPropuesta + i;
        if (!tituloOblig || !descOblig) {
          this.errorPropuesta = `Debes completar obligatoriamente el título y la descripción de la Propuesta ${numeroProp}.`;
          return;
        }
      }

      const propuestasCompletas = [];
      for (let i = 0; i < this.borradoresPropuestas.length; i++) {
        const titulo = (this.borradoresPropuestas[i].titulo || '').trim();
        const descripcion = (this.borradoresPropuestas[i].descripcion || '').trim();
        const numeroProp = this.numeroInicialNuevaPropuesta + i;

        if (!titulo || !descripcion) {
          this.errorPropuesta = `En la Propuesta ${numeroProp} debes completar tanto el título como la descripción.`;
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

        this.mensajePropuestaOk = `${propuestasCompletas.length} ${propuestasCompletas.length === 1 ? 'propuesta registrada' : 'propuestas registradas'} correctamente.`;
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