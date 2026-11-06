// Biblioteca de ejercicios: dibujo, nombre, grupo muscular y cómo se hace.
// Para añadir uno nuevo, guarda su dibujo en img/ejercicios/ y copia una de estas fichas.

const GRUPOS = ['Pecho', 'Hombros', 'Brazos', 'Espalda', 'Piernas', 'Abdomen'];

const EJERCICIOS = [
  // Pecho
  { id: 'press-banca', nombre: 'Press de banca', grupo: 'Pecho',
    resumen: 'Tumbado en el banco con una mancuerna en cada mano a la altura del pecho. Empuja hacia arriba hasta estirar los brazos y baja despacio.' },
  { id: 'press-inclinado', nombre: 'Press inclinado', grupo: 'Pecho',
    resumen: 'Igual que el press de banca, pero con el respaldo inclinado unos 30–45°. Trabaja más la parte alta del pecho.' },
  { id: 'aperturas', nombre: 'Aperturas', grupo: 'Pecho',
    resumen: 'Tumbado, con los brazos estirados hacia arriba y los codos un poco flexionados. Abre los brazos en arco hacia los lados hasta notar el pecho estirado y vuelve a juntarlos.' },
  { id: 'press-martillo', nombre: 'Press martillo', grupo: 'Pecho',
    resumen: 'Tumbado en el banco, con las palmas mirándose entre sí y las mancuernas juntas. Empuja hacia arriba sin separarlas y baja controlando.' },

  // Hombros
  { id: 'press-hombros', nombre: 'Press de hombros', grupo: 'Hombros',
    resumen: 'Sentado con la espalda apoyada y las mancuernas a la altura de las orejas. Empuja hacia arriba hasta estirar los brazos y baja hasta la posición inicial.' },
  { id: 'encogimientos', nombre: 'Encogimientos', grupo: 'Hombros',
    resumen: 'De pie, con los brazos estirados a los lados. Sube los hombros hacia las orejas, aguanta un segundo y bájalos despacio sin doblar los codos.' },
  { id: 'elevaciones-laterales', nombre: 'Elevaciones laterales', grupo: 'Hombros',
    resumen: 'De pie, con las mancuernas a los lados. Levanta los brazos hacia los lados hasta la altura de los hombros, con los codos ligeramente flexionados, y baja despacio.' },
  { id: 'elevaciones-frontales', nombre: 'Elevaciones frontales', grupo: 'Hombros',
    resumen: 'De pie, con las mancuernas delante de los muslos. Levanta los brazos al frente hasta la altura de los hombros y baja controlando, sin balancear el cuerpo.' },

  // Brazos
  { id: 'curl-martillo', nombre: 'Curl martillo', grupo: 'Brazos',
    resumen: 'Sentado, con las palmas mirando hacia el cuerpo. Dobla los codos subiendo las mancuernas hacia los hombros, sin girar las muñecas, y baja despacio.' },
  { id: 'curl-biceps', nombre: 'Curl de bíceps', grupo: 'Brazos',
    resumen: 'De pie, con las palmas mirando al frente y los codos pegados al cuerpo. Sube las mancuernas doblando los codos y baja hasta estirar los brazos.' },
  { id: 'patada-triceps', nombre: 'Patada de tríceps', grupo: 'Brazos',
    resumen: 'Inclinado hacia delante con la espalda recta y los codos pegados al cuerpo. Estira los brazos hacia atrás hasta que queden rectos y vuelve a doblarlos.' },
  { id: 'extension-triceps', nombre: 'Extensión de tríceps', grupo: 'Brazos',
    resumen: 'Sentado, con una mancuerna sujeta con las dos manos detrás de la cabeza. Estira los brazos hacia arriba y vuelve a bajarla detrás de la cabeza, con los codos apuntando al techo.' },

  // Espalda
  { id: 'pajaros', nombre: 'Pájaros', grupo: 'Espalda',
    resumen: 'Inclinado hacia delante con la espalda recta y las mancuernas colgando. Abre los brazos hacia los lados juntando los omóplatos y baja despacio.' },
  { id: 'remo-un-brazo', nombre: 'Remo a una mano', grupo: 'Espalda',
    resumen: 'Apoya una rodilla y una mano en el banco. Con la otra mano, tira de la mancuerna hacia la cadera llevando el codo hacia atrás y bájala estirando el brazo.' },
  { id: 'remo-inclinado', nombre: 'Remo inclinado', grupo: 'Espalda',
    resumen: 'De pie, con las rodillas algo flexionadas y el tronco inclinado. Tira de las dos mancuernas hacia la tripa llevando los codos atrás y baja controlando.' },
  { id: 'peso-muerto', nombre: 'Peso muerto', grupo: 'Espalda',
    resumen: 'Con las mancuernas en el suelo, flexiona caderas y rodillas manteniendo la espalda recta. Levántate empujando con las piernas hasta quedar de pie y vuelve a bajar.' },

  // Piernas
  { id: 'sentadilla', nombre: 'Sentadilla', grupo: 'Piernas',
    resumen: 'De pie, con los pies a la anchura de los hombros y una mancuerna en cada mano. Baja como si te sentaras en una silla, con la espalda recta, y sube empujando con los talones.' },
  { id: 'sentadilla-sumo', nombre: 'Sentadilla sumo', grupo: 'Piernas',
    resumen: 'Con los pies más separados que los hombros y las puntas hacia fuera, sujeta una mancuerna con las dos manos entre las piernas. Baja manteniendo el pecho alto y sube.' },
  { id: 'sentadilla-goblet', nombre: 'Sentadilla goblet', grupo: 'Piernas',
    resumen: 'Sujeta una mancuerna en vertical pegada al pecho. Baja en sentadilla con los codos entre las rodillas y la espalda recta, y vuelve a subir.' },
  { id: 'zancada', nombre: 'Zancada', grupo: 'Piernas',
    resumen: 'Da un paso largo hacia delante y baja hasta que las dos rodillas formen un ángulo recto. Empuja con la pierna de delante para volver y cambia de pierna.' },
  { id: 'subida-banco', nombre: 'Subida al banco', grupo: 'Piernas',
    resumen: 'Con una mancuerna en cada mano, apoya un pie entero en el banco y sube empujando con esa pierna hasta quedar de pie. Baja despacio y alterna.' },
  { id: 'elevacion-talones', nombre: 'Elevación de talones', grupo: 'Piernas',
    resumen: 'De pie, con las mancuernas a los lados. Ponte de puntillas lo más alto que puedas, aguanta un segundo y baja los talones despacio.' },
  { id: 'peso-muerto-rumano', nombre: 'Peso muerto rumano', grupo: 'Piernas',
    resumen: 'De pie, con las rodillas casi rectas. Inclina el tronco llevando la cadera hacia atrás y bajando las mancuernas pegadas a las piernas hasta notar el estiramiento detrás de los muslos. Vuelve a subir.' },
  { id: 'puente-gluteo', nombre: 'Puente de glúteo', grupo: 'Piernas',
    resumen: 'Con la espalda alta apoyada en el banco y una mancuerna sobre la cadera. Sube la cadera hasta que el cuerpo quede recto de hombros a rodillas, aprieta el glúteo y baja.' },

  // Abdomen
  { id: 'giro-ruso', nombre: 'Giro ruso', grupo: 'Abdomen',
    resumen: 'Sentado, con las rodillas dobladas y el tronco algo inclinado hacia atrás. Sujeta una mancuerna con las dos manos y gira el tronco de un lado a otro.' },
  { id: 'flexion-lateral', nombre: 'Flexión lateral', grupo: 'Abdomen',
    resumen: 'De pie, con una mancuerna en una mano y la otra en la cabeza. Inclina el tronco hacia el lado de la mancuerna y vuelve a subir. Haz las repeticiones y cambia de lado.' },
  { id: 'lenador', nombre: 'Leñador', grupo: 'Abdomen',
    resumen: 'Sujeta una mancuerna con las dos manos junto a una cadera. Llévala en diagonal por encima del hombro contrario girando el tronco y vuelve a bajar.' },
  { id: 'v-up', nombre: 'V-up', grupo: 'Abdomen',
    resumen: 'Tumbado boca arriba, con los brazos estirados por encima de la cabeza. Sube a la vez piernas y tronco intentando tocar los pies con las manos, formando una V, y baja despacio.' },
];

const ejercicioPorNombre = (nombre) => {
  const n = String(nombre || '').trim().toLowerCase();
  return EJERCICIOS.find((e) => e.nombre.toLowerCase() === n) || null;
};
