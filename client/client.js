/**
 * Browser half of MCP Catalog.
 *
 * The panel answers one question first: which MCP servers are live right now,
 * and what breaks when one is not. Installing and importing are the actions
 * that change that answer, so they sit one tab away instead of behind a
 * separate settings page.
 *
 * Palette, type and controls come from the host theme tokens, because the
 * panel lives inside the Harness UI rather than next to it.
 */

window.__ModuleLoader__.load({
  id: 'dsh-mcp-catalog',
  factory(require) {
    const React = require('react')
    const { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = React

    const NS = 'dsh-mcp-catalog'
    const PANEL_ID = 'mcp-catalog'
    const BASE = '/api/dsh-mcp-catalog'

    const en = {
      'panel.title': 'MCP Catalog',
      'panel.subtitle': 'Install MCP servers and mount them in this session.',
      'tab.installed': 'Installed',
      'tab.catalog': 'Catalog',
      'tab.import': 'Import',
      'action.refresh': 'Refresh',
      'action.add': 'Add server',
      'action.edit': 'Edit',
      'action.reconnect': 'Reconnect',
      'action.enable': 'Enable',
      'action.disable': 'Disable',
      'action.remove': 'Remove',
      'action.confirmRemove': 'Remove for good',
      'action.cancel': 'Cancel',
      'action.save': 'Save',
      'action.install': 'Install',
      'action.use': 'Use',
      'action.import': 'Import',
      'action.read': 'Read page',
      'action.back': 'Back to installed',
      'action.clear': 'Clear filter',
      'state.loading': 'Reading the server list…',
      'state.error': 'The host did not answer. Check that the plugin is still enabled, then refresh.',
      'state.empty': 'No servers installed yet.',
      'state.emptyHint': 'Pick one from the catalog, or import a server you already use in another client.',
      'server.tools': 'tools',
      'server.noTools': 'No tools yet',
      'server.toolsTitle': 'Tools published by this server',
      'server.phase.active': 'Connected',
      'server.phase.loading': 'Starting',
      'server.phase.pending': 'Starting',
      'server.phase.failed': 'Failed',
      'server.phase.stopped': 'Stopped',
      'server.phase.attached': 'Attached',
      'server.disabled': 'Disabled',
      'server.removeHint': 'This unmounts the server and deletes its definition.',
      'catalog.search': 'Search by name, package or tag',
      'catalog.all': 'All',
      'catalog.empty': 'No server matches this search.',
      'catalog.count': 'servers',
      'catalog.required': 'Needs',
      'catalog.from': 'From',
      'import.intro': 'These clients already define MCP servers. Importing copies a definition into this plugin; the other client keeps its file untouched.',
      'import.sources': 'Configurations on this machine',
      'import.dsh': 'Already loaded by this DSH profile',
      'import.dshHint': 'Disable the original Loader row before importing it here, or the server name is claimed twice.',
      'import.notFound': 'File not found.',
      'import.noServers': 'No servers in this file.',
      'import.link': 'Read a page or repository',
      'import.linkHint': 'The plugin fetches the page, looks for install commands and JSON config blocks, and shows what it found. Nothing is installed until you review it.',
      'import.urlPlaceholder': 'https://github.com/owner/repo',
      'import.candidates': 'Candidates found',
      'import.noCandidates': 'No install command found on that page. Add the server form manually instead.',
      'import.evidence': 'Seen in',
      'import.confidence.config': 'config block',
      'import.confidence.readme': 'install command',
      'import.reading': 'Reading the page…',
      'form.addTitle': 'Add an MCP server',
      'form.editTitle': 'Edit server',
      'form.name': 'Name',
      'form.nameHint': 'Used in tool names: mcp__<name>__<tool>. Letters, digits, underscore and dash.',
      'form.transport': 'Connection',
      'form.stdio': 'Local command',
      'form.http': 'Remote URL',
      'form.command': 'Command',
      'form.args': 'Arguments',
      'form.argsHint': 'One argument per line.',
      'form.env': 'Environment',
      'form.envHint': 'One KEY=value per line. Values also fill {{PLACEHOLDER}} references in arguments and headers.',
      'form.cwd': 'Working directory',
      'form.cwdHint': 'Optional. Defaults to the folder DSH was started from.',
      'form.url': 'URL',
      'form.headers': 'Headers',
      'form.headersHint': 'One Header: value per line. Keep tokens in the environment and reference them as {{NAME}}.',
      'form.enabled': 'Mount when saved',
      'form.requiredEnv': 'Required',
      'form.secret': 'secret',
      'form.note': 'Note',
      'form.catalogNote': 'Written for this catalog entry',
      'msg.saved': 'Saved.',
      'msg.removed': 'Removed.',
      'msg.installed': 'Installed. The server connects in the background; its tools appear here when it does.',
      'msg.refreshed': 'Up to date.',
    }

    const es = {
      'panel.title': 'Catálogo MCP',
      'panel.subtitle': 'Instala servidores MCP y móntalos en esta sesión.',
      'tab.installed': 'Instalados',
      'tab.catalog': 'Catálogo',
      'tab.import': 'Importar',
      'action.refresh': 'Actualizar',
      'action.add': 'Añadir servidor',
      'action.edit': 'Editar',
      'action.reconnect': 'Reconectar',
      'action.enable': 'Activar',
      'action.disable': 'Desactivar',
      'action.remove': 'Eliminar',
      'action.confirmRemove': 'Eliminar de verdad',
      'action.cancel': 'Cancelar',
      'action.save': 'Guardar',
      'action.install': 'Instalar',
      'action.use': 'Usar',
      'action.import': 'Importar',
      'action.read': 'Leer página',
      'action.back': 'Volver a instalados',
      'action.clear': 'Quitar filtro',
      'state.loading': 'Leyendo la lista de servidores…',
      'state.error': 'El host no respondió. Comprueba que el complemento sigue activo y actualiza.',
      'state.empty': 'Todavía no hay servidores instalados.',
      'state.emptyHint': 'Elige uno del catálogo o importa un servidor que ya uses en otro cliente.',
      'server.tools': 'herramientas',
      'server.noTools': 'Aún sin herramientas',
      'server.toolsTitle': 'Herramientas publicadas por este servidor',
      'server.phase.active': 'Conectado',
      'server.phase.loading': 'Arrancando',
      'server.phase.pending': 'Arrancando',
      'server.phase.failed': 'Falló',
      'server.phase.stopped': 'Detenido',
      'server.phase.attached': 'Vinculado',
      'server.disabled': 'Desactivado',
      'server.removeHint': 'Esto desmonta el servidor y borra su definición.',
      'catalog.search': 'Busca por nombre, paquete o etiqueta',
      'catalog.all': 'Todo',
      'catalog.empty': 'Ningún servidor coincide con la búsqueda.',
      'catalog.count': 'servidores',
      'catalog.required': 'Necesita',
      'catalog.from': 'Origen',
      'import.intro': 'Estos clientes ya definen servidores MCP. Importar copia una definición a este complemento; el otro cliente conserva su archivo intacto.',
      'import.sources': 'Configuraciones en esta máquina',
      'import.dsh': 'Ya cargados por este perfil de DSH',
      'import.dshHint': 'Desactiva la fila original del Loader antes de importarla aquí, o el nombre del servidor quedará ocupado dos veces.',
      'import.notFound': 'Archivo no encontrado.',
      'import.noServers': 'Este archivo no define servidores.',
      'import.link': 'Leer una página o repositorio',
      'import.linkHint': 'El complemento descarga la página, busca comandos de instalación y bloques JSON de configuración, y muestra lo que encuentra. No se instala nada hasta que lo revises.',
      'import.urlPlaceholder': 'https://github.com/usuario/repositorio',
      'import.candidates': 'Candidatos encontrados',
      'import.noCandidates': 'No hay ningún comando de instalación en esa página. Añade el servidor a mano.',
      'import.evidence': 'Aparece en',
      'import.confidence.config': 'bloque de configuración',
      'import.confidence.readme': 'comando de instalación',
      'import.reading': 'Leyendo la página…',
      'form.addTitle': 'Añadir un servidor MCP',
      'form.editTitle': 'Editar servidor',
      'form.name': 'Nombre',
      'form.nameHint': 'Se usa en los nombres de herramientas: mcp__<nombre>__<herramienta>. Letras, dígitos, guion bajo y guion.',
      'form.transport': 'Conexión',
      'form.stdio': 'Comando local',
      'form.http': 'URL remota',
      'form.command': 'Comando',
      'form.args': 'Argumentos',
      'form.argsHint': 'Un argumento por línea.',
      'form.env': 'Entorno',
      'form.envHint': 'Una línea KEY=valor por variable. Los valores también rellenan las referencias {{MARCADOR}} en argumentos y cabeceras.',
      'form.cwd': 'Directorio de trabajo',
      'form.cwdHint': 'Opcional. Por defecto, la carpeta desde la que arrancó DSH.',
      'form.url': 'URL',
      'form.headers': 'Cabeceras',
      'form.headersHint': 'Una cabecera por línea, con el formato Cabecera: valor. Guarda los tokens en el entorno y referéncialos como {{NOMBRE}}.',
      'form.enabled': 'Montar al guardar',
      'form.requiredEnv': 'Obligatoria',
      'form.secret': 'secreta',
      'form.note': 'Nota',
      'form.catalogNote': 'Escrita para esta entrada del catálogo',
      'msg.saved': 'Guardado.',
      'msg.removed': 'Eliminado.',
      'msg.installed': 'Instalado. El servidor se conecta en segundo plano; sus herramientas aparecerán aquí cuando lo haga.',
      'msg.refreshed': 'Todo al día.',
    }

    const zh = {
      'panel.title': 'MCP 目录',
      'panel.subtitle': '安装 MCP 服务器，并在当前会话中挂载。',
      'tab.installed': '已安装',
      'tab.catalog': '目录',
      'tab.import': '导入',
      'action.refresh': '刷新',
      'action.add': '添加服务器',
      'action.edit': '编辑',
      'action.reconnect': '重新连接',
      'action.enable': '启用',
      'action.disable': '禁用',
      'action.remove': '删除',
      'action.confirmRemove': '确认删除',
      'action.cancel': '取消',
      'action.save': '保存',
      'action.install': '安装',
      'action.use': '使用',
      'action.import': '导入',
      'action.read': '读取页面',
      'action.back': '返回已安装',
      'action.clear': '清除筛选',
      'state.loading': '正在读取服务器列表…',
      'state.error': '主机没有响应。请确认插件仍然启用，然后刷新。',
      'state.empty': '还没有安装服务器。',
      'state.emptyHint': '从目录中选择一个，或导入你在其他客户端已使用的服务器。',
      'server.tools': '个工具',
      'server.noTools': '暂无工具',
      'server.toolsTitle': '此服务器提供的工具',
      'server.phase.active': '已连接',
      'server.phase.loading': '启动中',
      'server.phase.pending': '启动中',
      'server.phase.failed': '失败',
      'server.phase.stopped': '已停止',
      'server.phase.attached': '已挂载',
      'server.disabled': '已禁用',
      'server.removeHint': '这会卸载服务器并删除其定义。',
      'catalog.search': '按名称、软件包或标签搜索',
      'catalog.all': '全部',
      'catalog.empty': '没有匹配的服务器。',
      'catalog.count': '个服务器',
      'catalog.required': '需要',
      'catalog.from': '来源',
      'import.intro': '这些客户端已经定义了 MCP 服务器。导入会把定义复制到本插件，另一个客户端的文件保持不变。',
      'import.sources': '本机配置',
      'import.dsh': '当前 DSH 配置已加载',
      'import.dshHint': '导入前请先停用原来的 Loader 行，否则服务器名称会被占用两次。',
      'import.notFound': '文件不存在。',
      'import.noServers': '此文件没有定义服务器。',
      'import.link': '读取页面或仓库',
      'import.linkHint': '插件会下载页面，查找安装命令和 JSON 配置块，并列出结果。确认之前不会安装任何东西。',
      'import.urlPlaceholder': 'https://github.com/用户名/仓库',
      'import.candidates': '找到的候选项',
      'import.noCandidates': '该页面没有安装命令。请手动添加服务器。',
      'import.evidence': '出现在',
      'import.confidence.config': '配置块',
      'import.confidence.readme': '安装命令',
      'import.reading': '正在读取页面…',
      'form.addTitle': '添加 MCP 服务器',
      'form.editTitle': '编辑服务器',
      'form.name': '名称',
      'form.nameHint': '用于工具名：mcp__<名称>__<工具>。仅限字母、数字、下划线和连字符。',
      'form.transport': '连接方式',
      'form.stdio': '本地命令',
      'form.http': '远程 URL',
      'form.command': '命令',
      'form.args': '参数',
      'form.argsHint': '每行一个参数。',
      'form.env': '环境变量',
      'form.envHint': '每行一个 KEY=值。值也会替换参数和请求头中的 {{占位符}}。',
      'form.cwd': '工作目录',
      'form.cwdHint': '可选。默认为 DSH 启动时所在目录。',
      'form.url': 'URL',
      'form.headers': '请求头',
      'form.headersHint': '每行一个请求头，格式为 名称: 值。令牌放在环境变量里，并用 {{名称}} 引用。',
      'form.enabled': '保存后挂载',
      'form.requiredEnv': '必填',
      'form.secret': '机密',
      'form.note': '说明',
      'form.catalogNote': '目录条目附带的说明',
      'msg.saved': '已保存。',
      'msg.removed': '已删除。',
      'msg.installed': '已安装。服务器会在后台连接，工具连接后出现在这里。',
      'msg.refreshed': '已是最新。',
    }

    const dictionary = { en, es, zh }

    /* ---------------------------------------------------------------- data */

    class ApiError extends Error {
      constructor(message, errors) {
        super(message)
        this.name = 'ApiError'
        this.errors = errors ?? []
      }
    }

    async function api(path, options = {}) {
      let response
      try {
        response = await fetch(BASE + path, {
          ...options,
          headers: {
            'content-type': 'application/json',
            'x-dsh-mcp-catalog': '1',
            ...(options.headers ?? {}),
          },
        })
      } catch {
        throw new ApiError('The host did not answer. Check that the plugin is still enabled, then refresh.')
      }
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new ApiError(data.error ?? response.statusText, data.errors)
      return data
    }

    function pick(text, locale) {
      if (typeof text === 'string') return text
      if (text === null || typeof text !== 'object') return ''
      return text[locale] ?? text.en ?? Object.values(text)[0] ?? ''
    }

    function splitLines(text) {
      return String(text ?? '')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line !== '')
    }

    function pairsToText(map) {
      if (map === null || typeof map !== 'object') return ''
      return Object.entries(map).map(([key, value]) => `${key}=${value}`).join('\n')
    }

    function headersToText(map) {
      if (map === null || typeof map !== 'object') return ''
      return Object.entries(map).map(([key, value]) => `${key}: ${value}`).join('\n')
    }

    function textToPairs(text, separator) {
      const out = {}
      for (const line of splitLines(text)) {
        const index = line.indexOf(separator)
        if (index <= 0) continue
        const key = line.slice(0, index).trim()
        const value = line.slice(index + separator.length).trim()
        if (key !== '') out[key] = value
      }
      return out
    }

    function draftFromCatalog(entry) {
      const env = {}
      for (const item of entry.env ?? []) env[item.name] = ''
      return {
        name: entry.name,
        transport: entry.transport,
        command: entry.command ?? '',
        args: entry.args ?? [],
        env,
        url: entry.url ?? '',
        headers: entry.headers ?? {},
        catalogId: entry.id,
        note: entry.note,
        requiredEnv: entry.env ?? [],
      }
    }

    function draftFromServer(server, extra = {}) {
      return {
        ...server,
        ...extra,
        args: server.args ?? [],
        env: server.env ?? {},
        headers: server.headers ?? {},
      }
    }

    /* --------------------------------------------------------------- icons */

    function SidebarIcon({ size = 20, className }) {
      return React.createElement(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          className,
          'aria-hidden': true,
        },
        React.createElement('rect', { x: 3.5, y: 4, width: 12, height: 16, rx: 2 }),
        React.createElement('path', { d: 'M6.5 8.5h6M6.5 12h6M6.5 15.5h4' }),
        React.createElement('path', { d: 'M18.5 7v5.5a2 2 0 0 1-2 2h-1' }),
        React.createElement('path', { d: 'M17 12l-1.5 2.5L17 17' }),
      )
    }

    /* ------------------------------------------------------------- helpers */

    function useActiveLocale(runtime) {
      const subscribe = useCallback(callback => runtime.ctx.locale.subscribe(callback), [runtime])
      const snapshot = useCallback(() => runtime.ctx.locale.getSnapshot().active, [runtime])
      return useSyncExternalStore(subscribe, snapshot, snapshot)
    }

    function phaseLabel(t, phase) {
      return t(`server.phase.${phase}`)
    }

    function StatusDot({ phase }) {
      const color = phase === 'active'
        ? 'var(--dsw-alias-state-success-primary)'
        : phase === 'failed'
          ? 'var(--dsw-alias-state-error-primary)'
          : phase === 'loading' || phase === 'pending'
            ? 'var(--dsw-alias-state-warn-primary)'
            : 'var(--dsw-alias-state-idle-primary)'
      return React.createElement('span', {
        className: 'mc-dot',
        style: { background: color },
        'aria-hidden': true,
      })
    }

    /* ---------------------------------------------------------------- form */

    function ServerForm({ runtime, t, mode, draft, existingNames, onSaved, onCancel }) {
      const [value, setValue] = useState(() => ({
        name: draft.name ?? '',
        transport: draft.transport === 'streamable-http' ? 'streamable-http' : 'stdio',
        command: draft.command ?? '',
        argsText: (draft.args ?? []).join('\n'),
        envText: pairsToText(draft.env),
        cwd: draft.cwd ?? '',
        url: draft.url ?? '',
        headersText: headersToText(draft.headers),
        enabled: draft.enabled !== false,
      }))
      const [errors, setErrors] = useState([])
      const [busy, setBusy] = useState(false)
      const activeLocale = useActiveLocale(runtime)
      const update = (field, next) => setValue(current => ({ ...current, [field]: next }))
      const requiredEnv = draft.requiredEnv ?? []

      async function submit(event) {
        event.preventDefault()
        setBusy(true)
        setErrors([])
        const server = {
          name: value.name.trim(),
          transport: value.transport,
          enabled: value.enabled,
          env: textToPairs(value.envText, '='),
          ...(value.transport === 'stdio'
            ? { command: value.command.trim(), args: splitLines(value.argsText), cwd: value.cwd.trim() }
            : { url: value.url.trim(), headers: textToPairs(value.headersText, ':') }),
        }
        if (draft.catalogId) server.catalogId = draft.catalogId
        if (draft.importedFrom) server.importedFrom = draft.importedFrom
        try {
          if (mode === 'edit') {
            await api('/server/update', { method: 'POST', body: JSON.stringify({ name: draft.name, patch: server }) })
          } else {
            await api('/servers', { method: 'POST', body: JSON.stringify({ server, source: draft.source }) })
          }
          onSaved(mode === 'edit' ? 'msg.saved' : 'msg.installed')
        } catch (error) {
          setErrors(error.errors?.length ? error.errors : [error.message])
        } finally {
          setBusy(false)
        }
      }

      return React.createElement(
        'form',
        { className: 'mc-form', onSubmit: submit },
        React.createElement('h2', { className: 'mc-form-title' }, t(mode === 'edit' ? 'form.editTitle' : 'form.addTitle')),

        draft.note
          ? React.createElement('p', { className: 'mc-note' },
              React.createElement('span', { className: 'mc-note-label' }, t('form.catalogNote')),
              ' ',
              pick(draft.note, activeLocale))
          : null,

        React.createElement(Field, { label: t('form.name'), hint: t('form.nameHint') },
          React.createElement('input', {
            className: 'mc-input',
            value: value.name,
            required: true,
            pattern: '[A-Za-z0-9_\\-]{1,32}',
            disabled: mode === 'edit',
            onChange: event => update('name', event.target.value),
          })),

        React.createElement(Field, { label: t('form.transport') },
          React.createElement('div', { className: 'mc-segmented', role: 'radiogroup' },
            ['stdio', 'streamable-http'].map(kind =>
              React.createElement('button', {
                key: kind,
                type: 'button',
                role: 'radio',
                'aria-checked': value.transport === kind,
                className: value.transport === kind ? 'mc-segment mc-segment-on' : 'mc-segment',
                onClick: () => update('transport', kind),
              }, t(kind === 'stdio' ? 'form.stdio' : 'form.http'))))),

        value.transport === 'stdio'
          ? React.createElement(React.Fragment, null,
              React.createElement(Field, { label: t('form.command') },
                React.createElement('input', {
                  className: 'mc-input mc-mono',
                  value: value.command,
                  required: true,
                  placeholder: 'npx',
                  onChange: event => update('command', event.target.value),
                })),
              React.createElement(Field, { label: t('form.args'), hint: t('form.argsHint') },
                React.createElement('textarea', {
                  className: 'mc-input mc-mono',
                  rows: 4,
                  value: value.argsText,
                  spellCheck: false,
                  onChange: event => update('argsText', event.target.value),
                })),
              React.createElement(Field, { label: t('form.cwd'), hint: t('form.cwdHint') },
                React.createElement('input', {
                  className: 'mc-input mc-mono',
                  value: value.cwd,
                  spellCheck: false,
                  onChange: event => update('cwd', event.target.value),
                })))
          : React.createElement(React.Fragment, null,
              React.createElement(Field, { label: t('form.url') },
                React.createElement('input', {
                  className: 'mc-input mc-mono',
                  type: 'url',
                  value: value.url,
                  required: true,
                  placeholder: 'https://example.com/mcp',
                  onChange: event => update('url', event.target.value),
                })),
              React.createElement(Field, { label: t('form.headers'), hint: t('form.headersHint') },
                React.createElement('textarea', {
                  className: 'mc-input mc-mono',
                  rows: 3,
                  value: value.headersText,
                  spellCheck: false,
                  onChange: event => update('headersText', event.target.value),
                }))),

        React.createElement(Field, { label: t('form.env'), hint: t('form.envHint') },
          React.createElement('textarea', {
            className: 'mc-input mc-mono',
            rows: 3,
            value: value.envText,
            spellCheck: false,
            onChange: event => update('envText', event.target.value),
          }),
          requiredEnv.length > 0
            ? React.createElement('p', { className: 'mc-hint' },
                `${t('form.requiredEnv')}: `,
                requiredEnv.map(item => `${item.name}${item.secret ? ` (${t('form.secret')})` : ''}`).join(', '))
            : null),

        React.createElement('label', { className: 'mc-check' },
          React.createElement('input', {
            type: 'checkbox',
            checked: value.enabled,
            onChange: event => update('enabled', event.target.checked),
          }),
          t('form.enabled')),

        errors.length > 0
          ? React.createElement('ul', { className: 'mc-errors', role: 'alert' },
              errors.map(message => React.createElement('li', { key: message }, message)))
          : null,

        React.createElement('div', { className: 'mc-form-actions' },
          React.createElement('button', { type: 'button', className: 'mc-button', onClick: onCancel, disabled: busy }, t('action.cancel')),
          React.createElement('button', { type: 'submit', className: 'mc-button mc-button-primary', disabled: busy },
            t(mode === 'edit' ? 'action.save' : 'action.install'))),
      )

      function Field({ label, hint, children }) {
        return React.createElement('label', { className: 'mc-field' },
          React.createElement('span', { className: 'mc-label' }, label),
          hint ? React.createElement('span', { className: 'mc-hint' }, hint) : null,
          children)
      }
    }

    /* ------------------------------------------------------------- installed */

    function InstalledTab({ state, t, onEdit, onAction, busy }) {
      const [confirming, setConfirming] = useState(null)
      const [openTools, setOpenTools] = useState(null)

      if (state.servers.length === 0) {
        return React.createElement('div', { className: 'mc-empty' },
          React.createElement('p', { className: 'mc-empty-title' }, t('state.empty')),
          React.createElement('p', { className: 'mc-empty-hint' }, t('state.emptyHint')))
      }

      return React.createElement('ul', { className: 'mc-server-list' },
        state.servers.map(server => {
          const status = server.status ?? {}
          const tools = status.tools ?? []
          const expanded = openTools === server.name
          return React.createElement('li', { key: server.name, className: 'mc-server' },
            React.createElement('div', { className: 'mc-server-head' },
              React.createElement(StatusDot, { phase: status.phase }),
              React.createElement('div', { className: 'mc-server-id' },
                React.createElement('h3', { className: 'mc-server-name' }, server.name),
                React.createElement('p', { className: 'mc-server-meta' },
                  server.transport === 'streamable-http' ? 'streamable-http' : 'stdio',
                  ' · ',
                  server.transport === 'streamable-http' ? server.url : server.command,
                  server.enabled ? '' : ` · ${t('server.disabled')}`)),
              React.createElement('span', { className: 'mc-phase' }, phaseLabel(t, status.phase))),

            status.error
              ? React.createElement('p', { className: 'mc-error-line', role: 'status' }, status.error)
              : null,

            React.createElement('div', { className: 'mc-server-tools' },
              React.createElement('button', {
                type: 'button',
                className: 'mc-tools-toggle',
                'aria-expanded': expanded,
                onClick: () => setOpenTools(expanded ? null : server.name),
              }, tools.length > 0 ? `${tools.length} ${t('server.tools')}` : t('server.noTools')),
              expanded
                ? React.createElement('ul', { className: 'mc-tool-list', 'aria-label': t('server.toolsTitle') },
                    tools.map(tool => React.createElement('li', { key: tool, className: 'mc-mono' }, tool.replace(`mcp__${server.name}__`, ''))))
                : null),

            React.createElement('div', { className: 'mc-server-actions' },
              React.createElement('button', { type: 'button', className: 'mc-button', onClick: () => onEdit(server), disabled: busy }, t('action.edit')),
              React.createElement('button', { type: 'button', className: 'mc-button', onClick: () => onAction('/server/reconnect', { name: server.name }, 'msg.refreshed'), disabled: busy }, t('action.reconnect')),
              React.createElement('button', {
                type: 'button',
                className: 'mc-button',
                onClick: () => onAction('/server/toggle', { name: server.name, enabled: !server.enabled }, 'msg.saved'),
                disabled: busy,
              }, server.enabled ? t('action.disable') : t('action.enable')),
              confirming === server.name
                ? React.createElement(React.Fragment, null,
                    React.createElement('button', { type: 'button', className: 'mc-button mc-button-danger', onClick: () => onAction('/server/remove', { name: server.name }, 'msg.removed'), disabled: busy }, t('action.confirmRemove')),
                    React.createElement('button', { type: 'button', className: 'mc-button', onClick: () => setConfirming(null) }, t('action.cancel')))
                : React.createElement('button', { type: 'button', className: 'mc-button mc-button-quiet', onClick: () => setConfirming(server.name), disabled: busy }, t('action.remove'))))
        }))
    }

    /* --------------------------------------------------------------- catalog */

    function CatalogTab({ runtime, t, locale, onPick }) {
      const [data, setData] = useState(null)
      const [error, setError] = useState('')
      const [query, setQuery] = useState('')
      const [category, setCategory] = useState('')

      useEffect(() => {
        let alive = true
        api(`/catalog?locale=${encodeURIComponent(locale)}`)
          .then(result => {
            if (alive) setData(result)
          })
          .catch(reason => {
            if (alive) setError(reason.message)
          })
        return () => {
          alive = false
        }
      }, [locale])

      const servers = data?.servers ?? []
      const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase()
        return servers.filter(server => {
          if (category !== '' && !(server.categories ?? []).includes(category)) return false
          if (needle === '') return true
          const haystack = [server.name, server.title, server.descriptionText, server.verified?.package, ...(server.tags ?? [])]
            .filter(Boolean).join(' ').toLowerCase()
          return haystack.includes(needle)
        })
      }, [servers, query, category])

      if (error !== '') {
        return React.createElement('p', { className: 'mc-error-line', role: 'alert' }, error)
      }
      if (data === null) {
        return React.createElement('p', { className: 'mc-loading' }, t('state.loading'))
      }

      return React.createElement('div', { className: 'mc-catalog' },
        React.createElement('div', { className: 'mc-filters' },
          React.createElement('input', {
            className: 'mc-input',
            type: 'search',
            value: query,
            placeholder: t('catalog.search'),
            'aria-label': t('catalog.search'),
            onChange: event => setQuery(event.target.value),
          }),
          React.createElement('div', { className: 'mc-chips' },
            React.createElement('button', {
              type: 'button',
              className: category === '' ? 'mc-chip mc-chip-on' : 'mc-chip',
              'aria-pressed': category === '',
              onClick: () => setCategory(''),
            }, t('catalog.all')),
            (data.categories ?? []).map(item =>
              React.createElement('button', {
                key: item.id,
                type: 'button',
                className: category === item.id ? 'mc-chip mc-chip-on' : 'mc-chip',
                'aria-pressed': category === item.id,
                onClick: () => setCategory(category === item.id ? '' : item.id),
              }, pick(item.title, locale))))),

        React.createElement('p', { className: 'mc-count' }, `${filtered.length} ${t('catalog.count')}`),

        filtered.length === 0
          ? React.createElement('div', { className: 'mc-empty' },
              React.createElement('p', { className: 'mc-empty-title' }, t('catalog.empty')),
              React.createElement('button', { type: 'button', className: 'mc-button', onClick: () => { setQuery(''); setCategory('') } }, t('action.clear')))
          : React.createElement('ul', { className: 'mc-catalog-list' },
              filtered.map(server =>
                React.createElement('li', { key: server.id, className: 'mc-catalog-item' },
                  React.createElement('div', { className: 'mc-catalog-text' },
                    React.createElement('div', { className: 'mc-catalog-head' },
                      React.createElement('h3', { className: 'mc-catalog-name' }, server.titleText || server.title || server.name),
                      React.createElement('span', { className: 'mc-mono mc-package' }, server.verified?.package ?? server.name)),
                    React.createElement('p', { className: 'mc-catalog-desc' }, server.descriptionText),
                    server.noteText
                      ? React.createElement('p', { className: 'mc-note' }, server.noteText)
                      : null,
                    (server.env ?? []).length > 0
                      ? React.createElement('p', { className: 'mc-hint' },
                          `${t('catalog.required')}: `,
                          server.env.map(item => item.name).join(', '))
                      : null),
                  React.createElement('div', { className: 'mc-catalog-action' },
                    React.createElement('span', { className: 'mc-transport' },
                      server.transport === 'streamable-http' ? t('form.http') : t('form.stdio')),
                    React.createElement('button', {
                      type: 'button',
                      className: 'mc-button mc-button-primary',
                      onClick: () => onPick(draftFromCatalog(server)),
                    }, t('action.use')))))))
    }

    /* ---------------------------------------------------------------- import */

    function ImportTab({ runtime, t, locale, onPick }) {
      const [discovered, setDiscovered] = useState(null)
      const [error, setError] = useState('')
      const [url, setUrl] = useState('')
      const [inspection, setInspection] = useState(null)
      const [reading, setReading] = useState(false)

      useEffect(() => {
        let alive = true
        api('/discover')
          .then(result => {
            if (alive) setDiscovered(result)
          })
          .catch(reason => {
            if (alive) setError(reason.message)
          })
        return () => {
          alive = false
        }
      }, [])

      async function readPage(event) {
        event.preventDefault()
        setReading(true)
        setInspection(null)
        setError('')
        try {
          const result = await api('/inspect', { method: 'POST', body: JSON.stringify({ url }) })
          setInspection(result)
        } catch (reason) {
          setError(reason.message)
        } finally {
          setReading(false)
        }
      }

      if (error !== '') {
        return React.createElement('p', { className: 'mc-error-line', role: 'alert' }, error)
      }
      if (discovered === null) {
        return React.createElement('p', { className: 'mc-loading' }, t('state.loading'))
      }

      return React.createElement('div', { className: 'mc-import' },
        React.createElement('p', { className: 'mc-intro' }, t('import.intro')),

        React.createElement('h3', { className: 'mc-section-title' }, t('import.sources')),
        React.createElement('ul', { className: 'mc-source-list' },
          (discovered.sources ?? []).map(source =>
            React.createElement('li', { key: source.id, className: 'mc-source' },
              React.createElement('div', { className: 'mc-source-head' },
                React.createElement('span', { className: 'mc-source-label' }, source.label),
                React.createElement('span', { className: 'mc-mono mc-source-path' }, source.path)),
              source.error
                ? React.createElement('p', { className: 'mc-hint' }, source.error === 'not found' ? t('import.notFound') : source.error)
                : (source.servers ?? []).length === 0
                  ? React.createElement('p', { className: 'mc-hint' }, t('import.noServers'))
                  : React.createElement('ul', { className: 'mc-source-servers' },
                      source.servers.map(server =>
                        React.createElement('li', { key: `${source.id}:${server.name}`, className: 'mc-source-server' },
                          React.createElement('div', { className: 'mc-source-server-id' },
                            React.createElement('span', { className: 'mc-mono' }, server.name),
                            React.createElement('span', { className: 'mc-hint' },
                              server.transport === 'streamable-http' ? server.url : [server.command, ...(server.args ?? [])].join(' '))),
                          React.createElement('button', {
                            type: 'button',
                            className: 'mc-button',
                            onClick: () => onPick(draftFromServer(server, { importedFrom: source.path })),
                          }, t('action.import')))))))),

        (discovered.dsh ?? []).length > 0
          ? React.createElement('div', { className: 'mc-dsh' },
              React.createElement('h3', { className: 'mc-section-title' }, t('import.dsh')),
              React.createElement('p', { className: 'mc-hint' }, t('import.dshHint')),
              React.createElement('ul', { className: 'mc-source-servers' },
                (discovered.dsh ?? []).map(row =>
                  React.createElement('li', { key: row.id || row.name, className: 'mc-source-server' },
                    React.createElement('div', { className: 'mc-source-server-id' },
                      React.createElement('span', { className: 'mc-mono' }, row.name),
                      React.createElement('span', { className: 'mc-hint' },
                        row.transport === 'streamable-http' ? row.url : [row.command, ...(row.args ?? [])].join(' '))),
                    React.createElement('button', {
                      type: 'button',
                      className: 'mc-button',
                      onClick: () => onPick(draftFromServer(row, { importedFrom: 'dsh-loader' })),
                    }, t('action.import'))))))
          : null,

        React.createElement('form', { className: 'mc-link', onSubmit: readPage },
          React.createElement('h3', { className: 'mc-section-title' }, t('import.link')),
          React.createElement('p', { className: 'mc-hint' }, t('import.linkHint')),
          React.createElement('div', { className: 'mc-link-row' },
            React.createElement('input', {
              className: 'mc-input mc-mono',
              type: 'url',
              required: true,
              value: url,
              placeholder: t('import.urlPlaceholder'),
              'aria-label': t('import.link'),
              onChange: event => setUrl(event.target.value),
            }),
            React.createElement('button', { type: 'submit', className: 'mc-button mc-button-primary', disabled: reading },
              reading ? t('import.reading') : t('action.read')))),

        inspection === null
          ? null
          : React.createElement('div', { className: 'mc-candidates' },
              React.createElement('h3', { className: 'mc-section-title' }, t('import.candidates')),
              inspection.candidates.length === 0
                ? React.createElement('p', { className: 'mc-hint' }, t('import.noCandidates'))
                : React.createElement('ul', { className: 'mc-source-servers' },
                    inspection.candidates.map((candidate, index) =>
                      React.createElement('li', { key: `${candidate.server.name}:${index}`, className: 'mc-source-server' },
                        React.createElement('div', { className: 'mc-source-server-id' },
                          React.createElement('span', { className: 'mc-mono' }, candidate.server.name),
                          React.createElement('span', { className: 'mc-hint' },
                            candidate.server.transport === 'streamable-http'
                              ? candidate.server.url
                              : [candidate.server.command, ...(candidate.server.args ?? [])].join(' ')),
                          React.createElement('span', { className: 'mc-hint' },
                            `${t('import.evidence')}: ${t(`import.confidence.${candidate.confidence}`)} · ${candidate.evidence}`)),
                        React.createElement('button', {
                          type: 'button',
                          className: 'mc-button',
                          onClick: () => onPick(draftFromServer(candidate.server, { importedFrom: inspection.url })),
                        }, t('action.use')))))))
    }

    /* ----------------------------------------------------------------- panel */

    function PanelPage({ runtime, t }) {
      const [state, setState] = useState({ loading: true, servers: [], version: '', error: '' })
      const [tab, setTab] = useState('installed')
      const [form, setForm] = useState(null)
      const [busy, setBusy] = useState(false)
      const [notice, setNotice] = useState(null)
      const [failure, setFailure] = useState('')
      const locale = useActiveLocale(runtime)

      const load = useCallback(async () => {
        try {
          const data = await api('/state')
          setState({ loading: false, servers: data.servers ?? [], version: data.version ?? '', error: '' })
        } catch (error) {
          setState(current => ({ ...current, loading: false, error: error.message }))
        }
      }, [])

      useEffect(() => {
        void load()
      }, [load])

      const pending = state.servers.some(server => {
        const status = server.status ?? {}
        return server.enabled && (status.phase === 'pending' || status.phase === 'loading' || (status.phase === 'active' && (status.tools ?? []).length === 0))
      })
      useEffect(() => {
        if (!pending) return
        const timer = setInterval(() => { void load() }, 2000)
        return () => clearInterval(timer)
      }, [pending, load])

      const run = useCallback(async (path, body, successKey) => {
        setBusy(true)
        setFailure('')
        try {
          await api(path, { method: 'POST', body: JSON.stringify(body) })
          setNotice(successKey)
          await load()
        } catch (error) {
          setFailure(error.errors?.length ? error.errors.join('; ') : error.message)
        } finally {
          setBusy(false)
        }
      }, [load])

      const saved = useCallback(async key => {
        setForm(null)
        setNotice(key)
        setFailure('')
        await load()
      }, [load])

      return React.createElement('div', { className: 'mc-root' },
        React.createElement('header', { className: 'mc-head' },
          React.createElement('div', null,
            React.createElement('h1', { className: 'mc-title' }, t('panel.title')),
            React.createElement('p', { className: 'mc-subtitle' }, t('panel.subtitle'))),
          React.createElement('div', { className: 'mc-head-actions' },
            React.createElement('span', { className: 'mc-version' }, state.version ? `v${state.version}` : ''),
            React.createElement('button', {
              type: 'button',
              className: 'mc-button',
              onClick: () => { void load(); setNotice('msg.refreshed') },
            }, t('action.refresh')))),

        React.createElement('nav', { className: 'mc-tabs', 'aria-label': t('panel.title') },
          [['installed', 'tab.installed'], ['catalog', 'tab.catalog'], ['import', 'tab.import']].map(([id, key]) =>
            React.createElement('button', {
              key: id,
              type: 'button',
              className: tab === id ? 'mc-tab mc-tab-on' : 'mc-tab',
              'aria-current': tab === id ? 'page' : undefined,
              onClick: () => { setTab(id); setForm(null); setNotice(null); setFailure('') },
            }, t(key)))),

        notice
          ? React.createElement('p', { className: 'mc-notice', role: 'status' }, t(notice))
          : null,
        failure
          ? React.createElement('p', { className: 'mc-error-line', role: 'alert' }, failure)
          : null,

        React.createElement('div', { className: 'mc-body' },
          form !== null
            ? React.createElement(ServerForm, {
                runtime,
                t,
                mode: form.mode,
                draft: form.draft,
                existingNames: state.servers.map(server => server.name),
                onSaved: saved,
                onCancel: () => { setForm(null); setFailure('') },
              })
            : tab === 'installed'
              ? (state.loading
                  ? React.createElement('p', { className: 'mc-loading' }, t('state.loading'))
                  : state.error !== ''
                    ? React.createElement('p', { className: 'mc-error-line', role: 'alert' }, t('state.error'))
                    : React.createElement(React.Fragment, null,
                        React.createElement('div', { className: 'mc-installed-head' },
                          React.createElement('button', {
                            type: 'button',
                            className: 'mc-button mc-button-primary',
                            onClick: () => setForm({ mode: 'add', draft: { transport: 'stdio', env: {} } }),
                          }, t('action.add'))),
                        React.createElement(InstalledTab, {
                          state,
                          t,
                          busy,
                          onEdit: server => setForm({ mode: 'edit', draft: draftFromServer(server) }),
                          onAction: run,
                        })))
              : tab === 'catalog'
                ? React.createElement(CatalogTab, {
                    runtime,
                    t,
                    locale,
                    onPick: draft => setForm({ mode: 'add', draft: { ...draft, source: 'catalog' } }),
                  })
                : React.createElement(ImportTab, {
                    runtime,
                    t,
                    locale,
                    onPick: draft => setForm({ mode: 'add', draft: { ...draft, source: 'import' } }),
                  })))
    }

    /* ---------------------------------------------------------------- styles */

    const CSS = `
      .mc-root { width: 100%; box-sizing: border-box; max-width: 1040px; margin: 0 auto; padding: 28px 24px 64px; color: var(--dsw-alias-label-primary); font-size: 14px; line-height: 1.5; }
      .mc-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 20px; }
      .mc-title { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
      .mc-subtitle { margin: 4px 0 0; color: var(--dsw-alias-label-secondary); }
      .mc-head-actions { display: flex; align-items: center; gap: 10px; flex: none; }
      .mc-version { color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
      .mc-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--dsw-alias-border-l2); margin-bottom: 20px; }
      .mc-tab { appearance: none; background: none; border: 0; border-bottom: 2px solid transparent; color: var(--dsw-alias-label-secondary); font: inherit; padding: 9px 12px; margin-bottom: -1px; cursor: pointer; }
      .mc-tab:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); }
      .mc-tab-on { color: var(--dsw-alias-label-primary); border-bottom-color: var(--dsw-alias-brand-primary); font-weight: 600; }
      .mc-tab:focus-visible, .mc-button:focus-visible, .mc-input:focus-visible, .mc-chip:focus-visible, .mc-tools-toggle:focus-visible, .mc-segment:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
      .mc-body { min-height: 240px; }
      .mc-button { appearance: none; font: inherit; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; padding: 6px 12px; cursor: pointer; }
      .mc-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
      .mc-button:disabled { opacity: 0.5; cursor: default; }
      .mc-button-primary { background: var(--dsw-alias-button-primary-fill); border-color: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-inverted); }
      .mc-button-primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); border-color: var(--dsw-alias-button-primary-hover); }
      .mc-button-danger { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); background: none; }
      .mc-button-quiet { background: none; border-color: transparent; color: var(--dsw-alias-label-tertiary); }
      .mc-button-quiet:hover:not(:disabled) { color: var(--dsw-alias-state-error-primary); background: var(--dsw-alias-interactive-bg-hover-danger); }
      .mc-installed-head { display: flex; justify-content: flex-end; margin-bottom: 12px; }
      .mc-server-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--dsw-alias-border-l2); }
      .mc-server { padding: 16px 0; border-bottom: 1px solid var(--dsw-alias-border-l2); }
      .mc-server-head { display: flex; align-items: center; gap: 10px; }
      .mc-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
      .mc-server-id { flex: 1; min-width: 0; }
      .mc-server-name { margin: 0; font-size: 15px; font-weight: 600; }
      .mc-server-meta { margin: 2px 0 0; color: var(--dsw-alias-label-tertiary); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .mc-phase { color: var(--dsw-alias-label-secondary); font-size: 12px; flex: none; }
      .mc-server-tools { margin: 10px 0 0 18px; }
      .mc-tools-toggle { appearance: none; background: none; border: 0; padding: 2px 0; font: inherit; font-size: 12px; color: var(--dsw-alias-link); cursor: pointer; }
      .mc-tool-list { margin: 6px 0 0; padding: 0 0 0 16px; color: var(--dsw-alias-label-secondary); font-size: 12px; columns: 2; column-gap: 24px; }
      .mc-server-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 0 18px; }
      .mc-error-line { margin: 10px 0 0; color: var(--dsw-alias-state-error-primary); font-size: 13px; }
      .mc-notice { margin: 0 0 14px; padding: 8px 12px; border-left: 3px solid var(--dsw-alias-state-success-primary); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); }
      .mc-loading { color: var(--dsw-alias-label-secondary); padding: 24px 0; }
      .mc-empty { padding: 40px 0; border-top: 1px solid var(--dsw-alias-border-l2); }
      .mc-empty-title { margin: 0 0 4px; font-weight: 600; }
      .mc-empty-hint { margin: 0 0 16px; color: var(--dsw-alias-label-secondary); }
      .mc-form { display: flex; flex-direction: column; gap: 16px; max-width: 640px; }
      .mc-form-title { margin: 0; font-size: 17px; font-weight: 600; }
      .mc-field { display: flex; flex-direction: column; gap: 4px; }
      .mc-label { font-weight: 600; font-size: 13px; }
      .mc-hint { color: var(--dsw-alias-label-tertiary); font-size: 12px; }
      .mc-input { font: inherit; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; padding: 7px 9px; width: 100%; box-sizing: border-box; }
      .mc-input:disabled { color: var(--dsw-alias-label-tertiary); }
      .mc-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
      .mc-note { margin: 0; padding: 8px 10px; background: var(--dsw-alias-bg-layer-1); border-left: 2px solid var(--dsw-alias-border-l3); color: var(--dsw-alias-label-secondary); font-size: 13px; }
      .mc-note-label { color: var(--dsw-alias-label-tertiary); }
      .mc-segmented { display: inline-flex; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; overflow: hidden; }
      .mc-segment { appearance: none; font: inherit; font-size: 13px; color: var(--dsw-alias-label-secondary); background: none; border: 0; padding: 6px 14px; cursor: pointer; }
      .mc-segment-on { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font-weight: 600; }
      .mc-check { display: flex; align-items: center; gap: 8px; }
      .mc-errors { margin: 0; padding-left: 18px; color: var(--dsw-alias-state-error-primary); }
      .mc-form-actions { display: flex; gap: 8px; padding-top: 4px; }
      .mc-filters { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
      .mc-chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .mc-chip { appearance: none; font: inherit; font-size: 12px; color: var(--dsw-alias-label-secondary); background: none; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; padding: 3px 10px; cursor: pointer; }
      .mc-chip-on { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-brand-primary); }
      .mc-count { margin: 0 0 10px; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
      .mc-catalog-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--dsw-alias-border-l2); }
      .mc-catalog-item { display: flex; gap: 20px; padding: 16px 0; border-bottom: 1px solid var(--dsw-alias-border-l2); }
      .mc-catalog-text { flex: 1; min-width: 0; }
      .mc-catalog-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
      .mc-catalog-name { margin: 0; font-size: 15px; font-weight: 600; }
      .mc-package { color: var(--dsw-alias-label-tertiary); font-size: 12px; }
      .mc-catalog-desc { margin: 4px 0 0; color: var(--dsw-alias-label-secondary); }
      .mc-catalog-action { display: flex; flex-direction: column; align-items: flex-end; justify-content: space-between; gap: 8px; flex: none; }
      .mc-transport { color: var(--dsw-alias-label-tertiary); font-size: 11px; }
      .mc-intro { margin: 0 0 20px; color: var(--dsw-alias-label-secondary); max-width: 70ch; }
      .mc-section-title { margin: 24px 0 8px; font-size: 13px; font-weight: 600; }
      .mc-source-list { list-style: none; margin: 0; padding: 0; }
      .mc-source { padding: 10px 0; border-bottom: 1px solid var(--dsw-alias-border-l2); }
      .mc-source-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
      .mc-source-label { font-weight: 600; }
      .mc-source-path { color: var(--dsw-alias-label-tertiary); font-size: 11.5px; word-break: break-all; }
      .mc-source-servers { list-style: none; margin: 8px 0 0; padding: 0; }
      .mc-source-server { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 7px 0 7px 12px; border-left: 1px solid var(--dsw-alias-border-l2); }
      .mc-source-server-id { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .mc-link { margin-top: 24px; }
      .mc-link-row { display: flex; gap: 8px; margin-top: 8px; }
      .mc-candidates { margin-top: 8px; }
      @media (max-width: 640px) {
        .mc-root { padding: 18px 16px 48px; }
        .mc-head { flex-direction: column; }
        .mc-catalog-item { flex-direction: column; gap: 10px; }
        .mc-catalog-action { flex-direction: row; align-items: center; }
        .mc-tool-list { columns: 1; }
        .mc-link-row { flex-direction: column; }
      }
    `

    /* --------------------------------------------------------------- module */

    const module = {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const runtime = { ctx }
        const t = ctx.locale.bind(NS)

        ctx.effect(() => {
          const dispose = ctx.locale.register(NS, dictionary)
          return () => {
            if (typeof dispose === 'function') dispose()
          }
        }, 'mcp-catalog: dictionaries')

        ctx.effect(() => {
          try {
            return ctx.locale.addLanguage({ id: 'es', label: 'Español', fallback: 'en' })
          } catch {
            // Another plugin already contributed Spanish; its pack wins.
            return undefined
          }
        }, 'mcp-catalog: Spanish language')

        ctx.effect(() => {
          const style = document.createElement('style')
          style.setAttribute('data-plugin', NS)
          style.textContent = CSS
          document.head.appendChild(style)
          return () => {
            style.remove()
          }
        }, 'mcp-catalog: styles')

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
          inject: () => ({ runtime }),
        }, PanelPage))

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 40,
          locale: NS,
          label: () => t('panel.title'),
        }, SidebarIcon))
      },
    }

    return module
  },
})
