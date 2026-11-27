# TODO

## Uso sin conexión y sincronización desde el móvil

- [ ] Permitir consultar y modificar la lista sin conexión desde la PWA instalada en el móvil.
  - Guardar una copia local de los datos en IndexedDB después de iniciar sesión y descargar la lista con conexión.
  - Guardar cada modificación y su operación pendiente de sincronización de forma persistente, incluso al cerrar la aplicación.
  - Sincronizar al recuperar conexión con la aplicación abierta y al volver a abrirla.
  - Añadir sincronización en segundo plano cuando el navegador la permita, sin depender de ella.
  - Identificar las operaciones para evitar duplicados durante los reintentos.
  - Definir cómo resolver los conflictos entre cambios realizados desde distintos dispositivos.
  - Mostrar el estado de conexión, los cambios pendientes y los errores de sincronización.
  - Conservar los cambios pendientes si caduca la sesión y solicitar autenticación antes de enviarlos.

## Varios usuarios identificados

- [x] Permitir que varios usuarios utilicen la misma aplicación, cada uno identificado y con su propia PWA en el móvil.
  - [x] Alta con invitación e inicio de sesión individual.
  - [x] Asociar cada sesión a un usuario.
  - [x] Mantener una lista de compra y un histórico propios para cada usuario.
  - [x] Impedir que un usuario consulte o modifique los datos de otro.
  - [ ] Separar las futuras copias locales y colas de sincronización por usuario al implementar el uso sin conexión.
  - [x] Mantener una misma aplicación y despliegue para todos los usuarios, sin necesitar una instancia independiente por móvil.

## Consulta de precios de Mercadona

- [x] Permitir consultar los productos de la tienda online de Mercadona desde cada producto de la lista.
  - [x] Abrir en una pestaña nueva la búsqueda oficial de Mercadona con el nombre del producto; por ejemplo, [leche](https://tienda.mercadona.es/search-results?query=leche).
  - [x] Dejar que el usuario elija en Mercadona la variante deseada y consulte allí su precio.
  - [x] Mantener la lista de compra sin cambios al consultar y no guardar precios que puedan quedar desactualizados.
  - [x] Usar la web oficial porque Mercadona no permite automatizar sus rutas `/api` según su `robots.txt`.
  - [x] Tener en cuenta que Mercadona puede pedir un código postal para mostrar la disponibilidad de la zona.

## Selector de supermercado

- [x] Mostrar un selector al pulsar la lupa de cualquier producto, pendiente o comprado.
  - [x] Permitir elegir Mercadona o Froiz antes de abrir la búsqueda en una nueva pestaña.
  - [x] Buscar por el nombre del producto en Mercadona (`https://tienda.mercadona.es/search-results?query=...`) o Froiz (`https://supermercado.froiz.com/?q=...`).
  - [x] Permitir cancelar el selector sin abrir una tienda ni modificar la lista.