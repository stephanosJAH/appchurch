# Expo SDK 57

Este proyecto usa **Expo SDK 57** (compatible con Expo Go 57 del usuario).
Consultá los docs versionados en https://docs.expo.dev/versions/v57.0.0/ antes
de escribir o actualizar código. No subas el SDK sin confirmar con el usuario:
Expo Go instala siempre la última versión desde Play Store y sólo corre apps del
SDK que le corresponde.

`.npmrc` fija `legacy-peer-deps=true`: `@react-native-community/datetimepicker`
declara un peer opcional a `react-native-windows`, que sólo llega hasta RN 0.84 y
choca con la 0.86 del SDK 57. Sin eso, todo `npm install` falla con ERESOLVE.
Como consecuencia npm ya no instala peers solos — si agregás una dependencia,
corré `npx expo-doctor` para detectar peers faltantes (así apareció `expo-font`).
