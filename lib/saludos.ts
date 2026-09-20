// Saludos del feed: uno por día, rotando sobre una lista fija.
//
// Cada saludo es personal (siempre lleva el nombre) y nace de un texto bíblico
// —el `cita` es lo que se muestra debajo, no una cita textual palabra por
// palabra—. Están escritos en singular ("contigo", no "con vosotros") porque le
// hablan a la persona que abrió la app, y sin adjetivos con género para que
// sirvan igual a cualquier nombre.
//
// Ninguno abre saludando ("hola", "bienvenido", "buen día", "qué bueno verte"):
// el saludo ya lo pone la tarjeta que los muestra (components/SaludoCard.tsx,
// "Hola, bienvenido! Hoy recordá"), y si además lo trae la frase se saluda dos
// veces. Acá va sólo lo que hay que recordar.

export type Saludo = {
  /** Texto con el marcador `{nombre}`; resolverlo con `saludoDelDia`. */
  texto: string;
  /** Referencia bíblica que inspira el saludo. */
  cita: string;
};

export const SALUDOS: Saludo[] = [
  { texto: "La paz sea contigo, {nombre}.", cita: "Juan 20:21" },
  { texto: "Que el Señor te bendiga y te guarde, {nombre}.", cita: "Números 6:24" },
  { texto: "Que el Señor haga resplandecer su rostro sobre ti, {nombre}.", cita: "Números 6:25" },
  { texto: "Gracia y paz a ti, {nombre}, de parte de Dios nuestro Padre.", cita: "Filipenses 1:2" },
  { texto: "Este es el día que hizo el Señor, {nombre}: gocémonos y alegrémonos en él.", cita: "Salmo 118:24" },
  { texto: "Sus misericordias son nuevas cada mañana, {nombre}.", cita: "Lamentaciones 3:22-23" },
  { texto: "Esfuérzate y sé valiente, {nombre}: Él va contigo dondequiera que vayas.", cita: "Josué 1:9" },
  { texto: "El Señor es tu pastor, {nombre}; nada te faltará hoy.", cita: "Salmo 23:1" },
  { texto: "Todo lo puedes, {nombre}, en Cristo que te fortalece.", cita: "Filipenses 4:13" },
  { texto: "El gozo del Señor es tu fuerza, {nombre}.", cita: "Nehemías 8:10" },
  { texto: "Si vienes cansado, {nombre}, Él te hará descansar.", cita: "Mateo 11:28" },
  { texto: "Eres luz del mundo, {nombre}: que hoy brille tu luz.", cita: "Mateo 5:14" },
  { texto: "Nada podrá separarte del amor de Cristo, {nombre}.", cita: "Romanos 8:39" },
  { texto: "El Señor peleará por ti, {nombre}; tú puedes estar tranquilo.", cita: "Éxodo 14:14" },
  { texto: "Echa sobre Él toda tu ansiedad, {nombre}: Él tiene cuidado de ti.", cita: "1 Pedro 5:7" },
  { texto: "Mira cuán bueno es, {nombre}, habitar los hermanos juntos.", cita: "Salmo 133:1" },
  { texto: "Donde dos o tres se reúnen en su nombre, {nombre}, allí está Él.", cita: "Mateo 18:20" },
  { texto: "Que la gracia del Señor Jesús sea contigo, {nombre}.", cita: "Apocalipsis 22:21" },
  { texto: "Grande es su fidelidad contigo, {nombre}.", cita: "Lamentaciones 3:23" },
  { texto: "Él renueva tus fuerzas hoy, {nombre}: levantarás alas como las águilas.", cita: "Isaías 40:31" },
  { texto: "No temas, {nombre}: Él te redimió y te llamó por tu nombre.", cita: "Isaías 43:1" },
  { texto: "Que su palabra sea hoy lámpara a tus pies, {nombre}.", cita: "Salmo 119:105" },
  { texto: "Deléitate en el Señor, {nombre}, y Él te concederá los anhelos de tu corazón.", cita: "Salmo 37:4" },
  { texto: "Que el Dios de esperanza te llene de todo gozo y paz, {nombre}.", cita: "Romanos 15:13" },
  { texto: "Él tiene para ti pensamientos de paz y un porvenir, {nombre}.", cita: "Jeremías 29:11" },
  { texto: "Permanece en la vid, {nombre}: sin Él nada podemos hacer.", cita: "Juan 15:5" },
  { texto: "Que tu amor abunde hoy, {nombre}, en ciencia y en todo conocimiento.", cita: "Filipenses 1:9" },
  { texto: "De mañana Él oye tu voz, {nombre}.", cita: "Salmo 5:3" },
  { texto: "Da gracias hoy, {nombre}: bueno es cantar al nombre del Altísimo.", cita: "Salmo 92:1" },
  { texto: "El Señor guardará tu salida y tu entrada, {nombre}.", cita: "Salmo 121:8" },
  { texto: "Que la paz de Cristo gobierne en tu corazón, {nombre}.", cita: "Colosenses 3:15" },
  { texto: "Un corazón alegre es buena medicina, {nombre}.", cita: "Proverbios 17:22" },
  { texto: "Confía en el Señor de todo corazón, {nombre}: Él enderezará tus veredas.", cita: "Proverbios 3:5-6" },
  { texto: "Eres de la familia de Dios, {nombre}: esta casa también es tuya.", cita: "Efesios 2:19" },
  { texto: "Eres hechura suya, {nombre}: Él preparó de antemano buenas obras para ti.", cita: "Efesios 2:10" },
  { texto: "Cerca está el Señor de los que le invocan, {nombre}.", cita: "Salmo 145:18" },
  { texto: "Que todo lo que respira alabe hoy al Señor, {nombre}.", cita: "Salmo 150:6" },
  { texto: "Corre con paciencia la carrera, {nombre}, con los ojos puestos en Jesús.", cita: "Hebreos 12:1-2" },
  { texto: "Sé fuerte en la gracia que es en Cristo Jesús, {nombre}.", cita: "2 Timoteo 2:1" },
  { texto: "Amémonos unos a otros, {nombre}, porque el amor es de Dios.", cita: "1 Juan 4:7" },
  { texto: "Alza tus ojos, {nombre}: tu socorro viene del Señor.", cita: "Salmo 121:1-2" },
  { texto: "Que el Espíritu dé hoy en ti amor, gozo y paz, {nombre}.", cita: "Gálatas 5:22" },
  { texto: "Tú y tu casa sirvan al Señor, {nombre}.", cita: "Josué 24:15" },
  { texto: "Con alegría saldrás hoy, {nombre}, y la paz irá contigo.", cita: "Isaías 55:12" },
  { texto: "Que el Señor encamine tu corazón al amor de Dios, {nombre}.", cita: "2 Tesalonicenses 3:5" },
];

// Día calendario absoluto (local) como entero: sirve de índice estable para que
// el saludo cambie a la medianoche y sea el mismo para todos ese día. `Date.UTC`
// sobre año/mes/día locales evita el corrimiento por huso y por horario de verano.
function diaAbsoluto(ref: Date): number {
  return Math.floor(Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate()) / 86_400_000);
}

// Saludo del día con el nombre ya resuelto. La lista tiene 45 frases: un mismo
// saludo vuelve a aparecer recién mes y medio después.
export function saludoDelDia(nombre: string, ref = new Date()): { texto: string; cita: string } {
  const i = ((diaAbsoluto(ref) % SALUDOS.length) + SALUDOS.length) % SALUDOS.length;
  const { texto, cita } = SALUDOS[i];
  return { texto: texto.replace("{nombre}", nombre), cita };
}
