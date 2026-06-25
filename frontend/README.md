# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## StructF Account Integration

AnionPDB uses the shared StructF account API for signed-in PhosFate runs and
history:

```env
VITE_ACCOUNT_API_BASE_URL=https://account.structf.studio
VITE_ACCOUNT_LOGIN_URL=https://account.structf.studio/login
```

Unsigned visitors keep the direct `/api/phosfate/run` path through
`VITE_PHOSFATE_API_BASE`, so public guest use does not depend on account
cookies. Signed-in users create `appSlug=anionpdb` jobs with
`jobType=anionpdb.phosfate.run`; results are available on `/History`.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
