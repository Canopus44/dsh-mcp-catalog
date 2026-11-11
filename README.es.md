# Catálogo MCP para DeepSeek Harness

Catálogo MCP encuentra los servidores MCP que ya están configurados en esta máquina, los importa a DeepSeek Harness y monta una lista curada de servidores como herramientas activas en la sesión actual. También lee una página de instalación o un repositorio que le indiques y muestra las definiciones de servidor que puede extraer.

Es un bundle de complemento de DSH: una mitad Host que guarda la lista de servidores y monta `@deepseek-ai/dsh-mcp-client` por servidor, y una mitad de navegador que dibuja una página completa con su entrada en la barra lateral.

- [English](README.md)
- [中文](README.zh.md)

## Qué hace

| Zona | Comportamiento |
| --- | --- |
| Instalados | Lista cada servidor gestionado por este complemento, su estado de conexión y las herramientas que publicó (`mcp__<nombre>__*`). Conectar, editar, desactivar, reconectar, eliminar. |
| Catálogo | 34 servidores curados entre desarrollo, bases de datos, navegador y pruebas, nube y DevOps, productividad y búsqueda. Busca por nombre, paquete, etiqueta o categoría. |
| Importar | Lee definiciones MCP de Claude Code, Claude Desktop, Cursor, VS Code, Codex, Gemini CLI y OpenCode (y sus equivalentes por proyecto), además de las filas que ya carga el perfil de DSH en marcha. No modifica ninguno de esos archivos. |
| Lector de páginas | Descarga una página pública `https` o el README de GitHub, extrae bloques JSON `mcpServers` y líneas de instalación con `npx`, `uvx` o `pnpm`, y las ofrece como candidatas para revisar. |

Todo camino de instalación termina en el mismo formulario: revisas el comando o la URL, rellenas los marcadores y guardas. Nada se monta en silencio.

## Requisitos

- DeepSeek Harness con soporte de complementos (`>=0.2.2-rc.1`, declarado en `dsh.engines.dsh`).
- Node.js 22 o superior para los servidores MCP locales que instales. El complemento en sí corre dentro de DSH.
- Red solo al abrir el lector de páginas del catálogo o un servidor remoto; la lista instalada y el catálogo funcionan sin conexión.

## Instalación

### Desde una carpeta local (desarrollo)

```bash
# desde este repositorio
dsh plugin --profile desktop add file:/ruta/absoluta/a/dsh-mcp-catalog
```

O en la aplicación: Ajustes → Complementos → instalar un bundle → elige la carpeta. Reinicia DSH después de reemplazar una copia ya instalada.

### Desde el índice de mercado publicado

El repositorio incluye un índice de mercado en `docs/market/index.json`. Añádelo como fuente personalizada:

1. Abre **Complementos**, elige **Más** junto a **Complementos experimentales** y activa **Custom plugin markets**.
2. Abre la pestaña **Discover** y añade la fuente `https://canopus44.github.io/dsh-mcp-catalog/market/index.json`.
3. Instala **MCP Catalog** desde ahí.

## Uso

Abre **Catálogo MCP** en la barra lateral. La página arranca en **Instalados**, que es el estado que importa: qué está montado, qué falló y qué herramientas existen ahora mismo.

- **Añadir servidor** abre el mismo formulario que usan el catálogo y el importador. Elige un comando local o una URL remota, pega las variables de entorno con una línea `CLAVE=valor` por variable y guarda.
- **Catálogo → Usar** rellena el formulario desde una entrada curada. Los marcadores como `{{FOLDER}}` o `{{DATABASE_PATH}}` deben sustituirse por valores reales, o por una variable de entorno con ese nombre.
- **Importar** copia una definición de otro cliente. Si apuntas a una página, extrae candidatas de su README. Ambas rutas terminan en el formulario de revisión.
- **Eliminar** pide un segundo clic y después desmonta y borra la definición.

Un servidor en `Falló` muestra el error de transporte en su sitio. Un servidor cuyo proceso arrancó pero aún no publicó herramientas se queda con el punto en `Arrancando` hasta que termina el handshake MCP.

### Secretos y marcadores

Los valores cuya clave parece secreta (`TOKEN`, `KEY`, `SECRET`, `PASSWORD`, `CREDENTIAL`, `AUTH`) se muestran como `••••••` en la interfaz y en la salida de las herramientas. Guardar el formulario con el valor redactado conserva el valor almacenado.

Una referencia `{{NOMBRE}}` en un argumento, una URL o una cabecera se rellena desde el mapa de entorno del propio servidor. Así el token vive en un solo sitio:

```
URL:       https://mcp.example.com/sse
Cabeceras: Authorization: Bearer {{EXAMPLE_API_KEY}}
Entorno:   EXAMPLE_API_KEY=...
```

Una definición con un marcador sin resolver se rechaza antes de guardarse, de modo que el fallo aparece en el formulario y no al conectar.

## Configuración

La fila del bundle acepta estas opciones:

| Opción | Valor por defecto | Significado |
| --- | --- | --- |
| `autoStart` | `true` | Monta los servidores activos al activarse el complemento. |
| `stateFile` | `""` | Sustituye la ruta del estado. Vacío significa `$DSH_HOME/mcp-market/servers.json`. |
| `extraSources` | `[]` | Archivos de configuración MCP adicionales que escanear en la pestaña Importar. |

Se editan en Ajustes → Complementos → Catálogo MCP. El complemento nunca reescribe el `cordis.patch.yml` del perfil; su lista de servidores vive en su propio archivo de estado.

## Herramientas para el modelo

La mitad Host registra siete herramientas, así que un agente puede gestionar servidores sin el panel:

| Herramienta | Para qué |
| --- | --- |
| `mcp_catalog_search` | Buscar en el catálogo curado. |
| `mcp_catalog_status` | Listar servidores instalados, fases y herramientas publicadas. |
| `mcp_catalog_install` | Validar y montar una definición. |
| `mcp_catalog_remove` | Desmontar y borrar un servidor. |
| `mcp_catalog_toggle` | Activar o desactivar sin borrar. |
| `mcp_catalog_discover` | Escanear configuraciones locales y filas de DSH. |
| `mcp_catalog_inspect` | Leer una página o repositorio y extraer candidatas. |

Las herramientas devuelven JSON. La edición de definiciones se queda en el panel para que un modelo no pueda cambiar un comando en silencio después de la revisión.

## Notas de seguridad

- La superficie HTTP son siete rutas bajo `/api/dsh-mcp-catalog`. DSH solo las reenvía para el principal propietario; las mutaciones exigen además la cabecera `x-dsh-mcp-catalog` y un `Origin` del mismo sitio.
- Los valores de entorno se guardan en texto plano en `$DSH_HOME/mcp-market/servers.json`, creado con modo `0600`. El transporte stdio de DSH mezcla solo este mapa explícito sobre un entorno padre depurado, así que los servidores MCP no heredan credenciales ambientales ajenas.
- El lector de páginas acepta solo URL públicas `https`, resuelve el DNS y rechaza direcciones privadas y link-local, limita la respuesta a 2 MiB y sigue como máximo tres redirecciones.
- La importación lee archivos de otros clientes; nunca escribe en ellos.
- Los servidores MCP remotos que piden OAuth aparecen con una nota. El cliente MCP de DSH habla streamable HTTP con cabeceras, no un flujo OAuth; usa una cabecera con token o pasa el servidor por `mcp-remote` cuando solo admita OAuth.

## Desarrollo

```bash
npm test        # pruebas unitarias (node:test)
npm run check   # manifiesto, exports, locale, icono, catálogo, índice, sintaxis
```

Estructura:

```
index.js              Entrada Host: configuración, rutas, herramientas, ciclo de vida
lib/                  estado, servidores, catálogo, descubrimiento, mercado, rutas, herramientas, inspección
client/client.js      Interfaz del panel (bundle del module loader, React desde la tabla de módulos)
data/catalog.json     Servidores curados, trilingües
docs/market/          Índice de mercado publicado e iconos
scripts/check.mjs     Comprobaciones de publicación
test/                 Pruebas unitarias
```

El panel usa solo tokens del tema del host y no copia primitivas de interfaz. El estado se serializa en una sola cola, así que dos instalaciones no compiten por el mismo archivo.

## Licencia

MIT.
