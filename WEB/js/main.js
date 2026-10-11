window.addEventListener('hashchange', router);
cargarPerfil().then(() => { router(); });
