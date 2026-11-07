# Guía de ASA Chispi Manager

> [!IMPORTANT]
> **Desarrollado con inteligencia artificial.** Se utilizaron ampliamente ChatGPT y Codex para escribir el código, diseñar la interfaz, crear pruebas automatizadas y redactar la documentación para Chispinela.

## 1. Instalar en Windows

1. Descarga el [instalador 1.0.7 para Windows x64](https://github.com/Chispinela/asa-chispi-manager/releases/download/v1.0.7/ASA-Chispi-Manager-Setup-1.0.7.exe).
2. Ejecuta el instalador, elige el idioma y abre ASA Chispi Manager. El instalador incluye el lector de partidas.
3. En **Preferencias**, pulsa **Reparar / descargar SteamCMD** o selecciona tu propio `steamcmd.exe`. Prevé espacio para los archivos de ARK, el guardado, las actualizaciones y las copias de seguridad.
4. Para actualizar el manager, cierra la versión anterior cuando termine cualquier operación y ejecuta el nuevo instalador con la misma cuenta de Windows.

## 2. Crear The Island

1. Pulsa **Crear servidor**. Elige una carpeta vacía y dedicada, por ejemplo `D:\ASA\TheIsland`.
2. Ponle un nombre y selecciona `TheIsland_WP`. Elige las plazas y las plataformas admitidas.
3. Revisa los puertos. Para la primera instancia puedes usar **7777 UDP** para el juego, **27015 UDP** para consulta y **27020 TCP** para RCON. Si creas otra instancia, dale una carpeta y puertos distintos. RCON lo usa el manager desde el mismo equipo.
4. La **Contraseña del servidor** controla la entrada de jugadores. Déjala vacía para permitir acceso sin contraseña. La **Contraseña de administrador** se usa para administrar ARK y para RCON. Si la dejas vacía, el manager genera una.
5. Pulsa **Instalar / actualizar ASA** en la tarjeta del servidor. Sigue el progreso en **Consola → Consola de SteamCMD**. Espera a que finalice la instalación de la aplicación de Steam `2430930`.
6. Pulsa **Abrir servidor** y espera a que responda RCON. Busca el nombre del servidor en la lista de servidores no oficiales de ARK o conecta a la dirección del equipo y el puerto de juego. Si la partida será accesible desde Internet, revisa las reglas de Windows y del router para el tráfico de juego. No expongas el puerto de administración RCON a Internet.

## 3. Configurar y mantener

- **Contraseña de entrada.** Detén el servidor y entra en **Configuración → Servidor y arranque**. Escribe la nueva contraseña, deja el campo vacío para conservar la actual o marca **Quitar contraseña del servidor**. Guarda y arranca el servidor.
- **Archivos INI.** En **Configuración** puedes buscar claves habituales en el catálogo o editar directamente `GameUserSettings.ini`, `Game.ini` y `Engine.ini`. El catálogo es orientativo. Consulta la [wiki de configuración de ARK](https://ark.wiki.gg/wiki/Server_configuration) para el significado y la compatibilidad de cada clave.
- **Mods.** Abre **Mods** y escribe los IDs numéricos de los proyectos de CurseForge en orden. Guarda con el servidor detenido y revisa el registro del siguiente arranque.
- **Clúster.** Desde **Clústeres**, elige un ID y una carpeta compartida de transferencias, añade los servidores detenidos y revisa las reglas de subida y descarga en los INI. En una migración, conserva el ID y la carpeta compartida que ya usa el clúster.
- **Jugadores.** **Jugadores** combina la lista actual de RCON con el historial observado. Puedes leer un mundo guardado con el servidor detenido para recuperar información de jugadores y tribus cuando el formato lo permita. La lista de administradores usa IDs EOS. Los comandos de teletransporte que requieren un personaje se copian para ejecutarlos desde la consola de administrador del juego.
- **Comandos.** Usa **Consola → Consola del juego** con el servidor en marcha. Por ejemplo, escribe `Broadcast El servidor se reiniciará en 10 minutos` y comprueba la respuesta.
- **Respaldos.** En **Respaldos**, elige los días y escribe varias horas separadas por comas, por ejemplo `06:00, 18:00`. Se usa la hora local de Windows. Un respaldo puede detener y volver a arrancar los miembros del clúster para proteger los datos compartidos. Prueba las restauraciones antes de depender de ellas.
- **Plantillas.** Crea una plantilla desde el servidor de origen y aplícala desde el de destino. Las claves de identidad, puertos y contraseñas gestionadas se conservan en el destino. Revisa las claves de mods antes de compartir una plantilla.
- **Importar HaruHost.** Guarda y detén el servidor, desactiva su reinicio automático en HaruHost y haz una copia externa. En **Importar servidor**, selecciona la raíz que contiene `ShooterGame`, examina la carpeta y revisa lo detectado. Consulta la [guía de migración](MIGRACION.md).

## 4. Discord

### Avisos de arranque, parada y reinicio

Abre **Discord y chat** en el servidor elegido. Pega la URL del webhook en su campo, personaliza los avisos y guarda. Usa `{server}`, `{map}` y `{time}` para incorporar los datos del evento. Si dejas un texto vacío, ese aviso se omite.

### Chat de Discord con ARK

1. Crea un bot en el [Discord Developer Portal](https://discord.com/developers/applications), habilita **Message Content Intent** y añade el bot a tu servidor de Discord.
2. Dale **Ver canal** y **Leer historial de mensajes** en el canal del chat. Para publicar mediante el bot, añade **Enviar mensajes**.
3. En **Discord y chat → Discord → ARK**, guarda el token del bot y el ID del canal. Puedes rellenar también el ID del servidor de Discord. Activa el envío hacia el juego y comprueba la conexión del bot.
4. Habilita el chat para los servidores ARK que quieras enlazar. Prueba con un mensaje nuevo mientras el manager está abierto y hay un jugador dentro.

### Panel de servidores

En **Discord y chat → Panel de servidores en directo**, indica el ID del canal del panel. Activa la detección automática de IPv4 pública o configura una IP o dominio fijo. Da al bot permisos para ver y enviar mensajes, insertar enlaces y adjuntar archivos. El bot edita sus tarjetas con estado, versión, tiempo activo, dirección y jugadores conectados. El canal debe ser visible solo para el público con el que quieras compartir esos datos.

Para compartir chat entre mapas, asigna el mismo **Grupo de chat** a los servidores participantes. El manager añade el mapa de origen al nombre disponible del jugador.

## 5. Si algo falla

| Síntoma | Comprobación |
| --- | --- |
| SteamCMD no descarga o no actualiza | Revisa espacio y permisos de la carpeta, repara SteamCMD desde **Preferencias** y exporta el registro completo. Consulta [el diagnóstico](REPARACION-STEAMCMD.md). |
| ARK está arrancando, pero el manager aún no muestra jugadores | Espera a que cargue el mapa y revisa que RCON esté habilitado, con el puerto y la contraseña de administrador correctos. |
| El bot ve el canal, pero no envía el chat a ARK | Revisa **Message Content Intent**, el canal guardado, **Enviar Discord → juego** y el chat habilitado para el servidor ARK. Envía un mensaje nuevo desde una cuenta de usuario. |
| No se actualizan el panel ni los respaldos programados | Mantén abierto el manager y Windows despierto. |
| Se puede entrar desde la LAN, pero no desde fuera | Revisa la dirección pública, la redirección de puertos y el cortafuegos. La detección de IP por sí sola no comprueba acceso desde Internet. |

En **Preferencias**, abre la carpeta de datos para encontrar la configuración del manager. Conserva los guardados y copias de seguridad en un lugar separado y protege los INI, que pueden contener contraseñas.
