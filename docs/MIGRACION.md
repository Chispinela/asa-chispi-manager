# Migrar un servidor de HaruHost

1. Anota el mapa, puertos, mods en orden, argumentos de arranque y cualquier `AltSaveDirectoryName`. Si hay clúster, anota su ID y la ruta exacta de su carpeta compartida. Conserva las contraseñas existentes.
2. Guarda el mundo desde HaruHost y detén el servidor. Desactiva su reinicio automático y sus tareas de mantenimiento para evitar que ambos programas lo arranquen a la vez.
3. Haz una copia externa de **toda la carpeta `ShooterGame/Saved`** y de la **carpeta de transferencias del clúster**. Conserva también los argumentos de HaruHost; pueden estar fuera de la carpeta del servidor.
4. En ASA Chispi Manager, elige **Importar servidor** y selecciona la raíz que contiene `ShooterGame/Binaries/Win64/ArkAscendedServer.exe`.
5. Pulsa **Examinar carpeta**. Revisa lo detectado. Los scripts de la raíz se leen como texto, pero nunca se ejecutan. Si HaruHost guardaba los argumentos en su base de datos, introdúcelos manualmente. El mapa se puede escribir en el campo personalizado.
6. Revisa el mapa, los tres puertos, las plazas, plataformas, mods y carpeta alternativa. Los argumentos que no tengan campo propio se añaden uno por línea en **Configuración → Servidor y arranque**. No copies otra vez `-mods`, `-port`, `-clusterid`, etc. en los argumentos adicionales: tienen campos propios.
7. Importa. Este paso registra la carpeta sin reescribir los INI. Puedes hacer un respaldo desde el manager antes de editar. No borres tu copia externa.
8. En **Configuración**, comprueba `RCONEnabled=True`, el `RCONPort` correcto y un `ServerAdminPassword` no vacío. La contraseña existente se conserva; el manager solo genera una para servidores nuevos. RCON usa la interfaz local `127.0.0.1`.
9. Si hay clúster, importa todos sus servidores, detenidos, y crea el clúster con **el mismo ID y la carpeta compartida existente**. No cambies esa ruta por una carpeta vacía: contiene los personajes y objetos en tránsito. Revisa `PreventDownload*`, `PreventUpload*` y `NoTributeDownloads` en cada servidor.
10. En **Jugadores**, puedes leer un mundo `.ark` del servidor detenido. Se analiza una copia privada y se muestran los datos recuperables del último guardado. Los avisos de formato y las identidades sin EOS aparecen en el informe.
11. Arranca un servidor, espera a que responda RCON y entra con un cliente real. Comprueba el personaje, tribu, edificios y mods. Después valida el acceso a los otros mapas y las transferencias del clúster con una copia recuperable. La importación de una carpeta por sí sola no demuestra que un clúster funcione dentro del juego.

Los servidores necesitan carpetas de instalación independientes en esta versión. No se admite registrar dos instancias sobre la misma carpeta, ni sobre carpetas padre/hija. Si HaruHost compartía binarios con guardados separados, prepara carpetas independientes y conserva sus guardados completos antes de importarlas.

El manager no elimina partidas al quitar un servidor de la lista. La restauración guarda un respaldo previo y conserva la antigua carpeta `Saved.before-restore-…` junto a la nueva. Los respaldos no se eliminan automáticamente.

Para el chat compartido, asigna el mismo grupo en **Discord y chat** a los servidores detenidos, guarda y arráncalos. El mensaje tendrá el nombre disponible del personaje o el nombre informado por el servidor, más el mapa. Un webhook basta para avisos hacia Discord; para Discord → juego configura el bot con los permisos y Message Content Intent indicados en la aplicación.
