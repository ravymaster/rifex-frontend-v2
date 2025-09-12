# Flujo de trabajo con Git (Windows / CMD)

Guía rápida para:
- Descargar **ZIP** del proyecto sin secretos.
- Subir el proyecto a GitHub y **mantenerlo actualizado**.
- Buenas prácticas (.env ignorados, ramas, tags).
- Solución de problemas comunes.

---

## TL;DR (lo mínimo del día a día)

```cmd
:: 1) Trae cambios del remoto (por si hay)
git pull

:: 2) Revisa cambios locales
git status

:: 3) Prepara y guarda
git add -A
git commit -m "feat: lo que hiciste"

:: 4) Sube
git push
