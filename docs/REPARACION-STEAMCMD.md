# Reparación y diagnóstico de SteamCMD — versión 1.0.2

La aplicación dispone de una consola de SteamCMD propia, separada de RCON y de los registros del juego. Al pulsar **Instalar / actualizar ASA**, se abre automáticamente. Muestra la salida en directo, el intento, el estado y el código de salida. **Guardar registro completo** exporta el archivo de esa sesión. Los archivos originales permanecen en la carpeta de datos del manager, en `fleet/logs/steamcmd/<id-servidor>/`.

## Usar la reparación

1. Instala la versión actual sobre la anterior, cerrando el manager cuando no haya operaciones activas. El instalador conserva sus datos, servidores y configuraciones.
2. En **Preferencias**, pulsa **Reparar / descargar SteamCMD**. Se descarga desde Valve una copia nueva en otra carpeta del manager y se selecciona automáticamente. La copia antigua y sus registros se conservan.
3. En **Todos los servidores**, localiza el mapa y revisa su carpeta. Detén el servidor y los otros miembros de su clúster antes de actualizar. La actualización hace previamente un respaldo completo.
4. Pulsa **Instalar / actualizar ASA** en la tarjeta correcta. La consola indicará primero que está preparando SteamCMD y comprobando el acceso anónimo, y después que comienza la actualización de la app `2430930`.
5. Si falla, conserva el código de salida y el registro. Un error de espacio, permisos o conexión no se presenta como una actualización correcta. La aplicación no desactiva la seguridad de Windows ni cambia permisos de carpetas automáticamente.

Las rutas con espacios se pasan a SteamCMD mediante un archivo de comandos con la ruta entre comillas. La preparación del cliente se ejecuta antes de la orden de actualizar ASA. El estado se considera correcto cuando la ejecución de actualización termina sin error, SteamCMD confirma explícitamente el resultado de la app y el ejecutable del servidor está en su carpeta.

## Qué se comprobó realmente

Se descargó una copia oficial de SteamCMD en una carpeta local de pruebas. Su primer inicio descargó las actualizaciones del cliente, completó el acceso anónimo y terminó con código **7**. Al ejecutar de nuevo esa misma copia preparada, completó el acceso anónimo con código **0**. Los registros se conservaron en `test-results/steam-probe-…`.

La recuperación de esa fase solo se permite una vez y con señales concretas del autoactualizado y del acceso completado, o con el error específico `Missing configuration`. No se reintentan indiscriminadamente los errores de permisos, falta de disco o rechazo de Steam.

Las pruebas de interfaz usan un ejecutable de prueba identificado como `UI FIXTURE` para comprobar progreso en directo, un error de escritura con código 8, exportación del registro y recuperación. Estas pruebas no descargan archivos de ASA ni prueban la actualización real de una partida.

La reparación local y la nueva aplicación no demuestran que la instalación de otro dispositivo haya sido modificada. Para validar una reparación remota es necesario ejecutar la nueva versión en ese equipo y revisar sus propios registros y carpetas.

