/* Pulse Jumper — translation tables (see src/i18n.js).
 * Each row: [English key, es-419, de-DE, fr-FR, pt-BR, it-IT]. en-GB, es-ES and
 * fr-CA list only where they differ from en-US, es-419 and fr-FR.
 * "Pulse Jumper", "StarHermit" and the two forms PULSE and NOVA are names and
 * stay as they are. The account strings live in src/platform-i18n.js. The
 * engine loads this classic script (native/i18n.ts); tests/i18n.test.js checks
 * that every key the client draws is here and no row is unused.
 */
(function (root) {
  'use strict';
  var ROWS = [
    // ---- HUD and touch buttons
    ['SCORE', 'PUNTOS', 'PUNKTE', 'SCORE', 'PONTOS', 'PUNTI'],
    ['Level progress', 'Progreso del nivel', 'Levelfortschritt', 'Progression du niveau', 'Progresso da fase', 'Avanzamento del livello'],
    ['Pause game', 'Pausar el juego', 'Spiel pausieren', 'Mettre le jeu en pause', 'Pausar o jogo', 'Metti in pausa'],
    ['Form (F or left tap)', 'Forma (F o toque a la izquierda)', 'Form (F oder links tippen)', 'Forme (F ou toucher à gauche)', 'Forma (F ou toque à esquerda)', 'Forma (F o tocco a sinistra)'],
    ['FORM', 'FORMA', 'FORM', 'FORME', 'FORMA', 'FORMA'],
    ['left tap', 'toque izq.', 'links tippen', 'toucher à g.', 'toque à esq.', 'tocco a sin.'],
    ['Jump (Space or right tap)', 'Saltar (Espacio o toque a la derecha)', 'Springen (Leertaste oder rechts tippen)', 'Sauter (Espace ou toucher à droite)', 'Pular (Espaço ou toque à direita)', 'Salta (Spazio o tocco a destra)'],
    ['JUMP', 'SALTAR', 'SPRUNG', 'SAUTER', 'PULAR', 'SALTA'],
    ['right tap', 'toque der.', 'rechts tippen', 'toucher à d.', 'toque à dir.', 'tocco a des.'],

    // ---- title
    ['A one-button rhythm platformer in a neon world. Jump the slabs, phase the gates, ride the pulse.',
      'Un plataformas rítmico de un solo botón en un mundo de neón. Salta los bloques, atraviesa las puertas, sigue el pulso.',
      'Ein Ein-Tasten-Rhythmus-Plattformer in einer Neonwelt. Spring über Blöcke, gleite durch Tore, folge dem Puls.',
      'Un jeu de plateforme rythmique à un bouton dans un monde néon. Sautez les dalles, traversez les portes, suivez le pouls.',
      'Um plataforma rítmico de um botão em um mundo neon. Pule os blocos, atravesse os portões, siga o pulso.',
      'Un platform ritmico a un solo tasto in un mondo al neon. Salta i blocchi, attraversa i portali, segui il battito.'],
    ['▶ PLAY', '▶ JUGAR', '▶ SPIELEN', '▶ JOUER', '▶ JOGAR', '▶ GIOCA'],
    ['Daily', 'Diario', 'Täglich', 'Quotidien', 'Diário', 'Giornaliera'],
    ['Journey', 'Travesía', 'Reise', 'Voyage', 'Jornada', 'Viaggio'],
    ['Learn', 'Aprender', 'Lernen', 'Apprendre', 'Aprender', 'Impara'],
    ['Help', 'Ayuda', 'Hilfe', 'Aide', 'Ajuda', 'Aiuto'],
    ['Settings', 'Configuración', 'Einstellungen', 'Paramètres', 'Configurações', 'Impostazioni'],
    ['Progress', 'Progreso', 'Fortschritt', 'Progression', 'Progresso', 'Progressi'],
    ['Journey stage {n} of {total} unlocked.', 'Etapa {n} de {total} de la travesía desbloqueada.', 'Reiseetappe {n} von {total} freigeschaltet.', 'Étape {n} sur {total} du voyage débloquée.', 'Etapa {n} de {total} da jornada desbloqueada.', 'Tappa {n} di {total} del viaggio sbloccata.'],
    ['Lessons completed: {n}/3.', 'Lecciones completadas: {n}/3.', 'Abgeschlossene Lektionen: {n}/3.', 'Leçons terminées : {n}/3.', 'Lições concluídas: {n}/3.', 'Lezioni completate: {n}/3.'],
    ['Achievements unlocked: {n}.', 'Logros desbloqueados: {n}.', 'Freigeschaltete Erfolge: {n}.', 'Succès débloqués : {n}.', 'Conquistas desbloqueadas: {n}.', 'Obiettivi sbloccati: {n}.'],
    ['Today', 'Hoy', 'Heute', 'Aujourd’hui', 'Hoje', 'Oggi'],
    ['Daily challenge for {date} — seed {seed}. Ranked.', 'Desafío diario del {date}: semilla {seed}. Clasificatorio.', 'Tägliche Herausforderung für {date} – Seed {seed}. Gewertet.', 'Défi du jour du {date} — graine {seed}. Classé.', 'Desafio diário de {date} — semente {seed}. Ranqueado.', 'Sfida giornaliera del {date} — seme {seed}. Classificata.'],
    ['Daily challenge: local UTC day, unranked.', 'Desafío diario: día UTC local, sin clasificación.', 'Tägliche Herausforderung: lokaler UTC-Tag, ungewertet.', 'Défi du jour : jour UTC local, non classé.', 'Desafio diário: dia UTC local, sem ranking.', 'Sfida giornaliera: giorno UTC locale, non classificata.'],
    ['Playing as {name}', 'Jugando como {name}', 'Du spielst als {name}', 'Vous jouez en tant que {name}', 'Jogando como {name}', 'Giochi come {name}'],
    ['saving…', 'guardando…', 'wird gespeichert …', 'enregistrement…', 'salvando…', 'salvataggio…'],
    ['cloud save synced', 'guardado en la nube sincronizado', 'Cloud-Spielstand synchronisiert', 'sauvegarde en ligne synchronisée', 'salvamento na nuvem sincronizado', 'salvataggio cloud sincronizzato'],
    ['offline — progress kept locally', 'sin conexión: el progreso se guarda en este dispositivo', 'offline – Fortschritt bleibt lokal', 'hors ligne — progression conservée sur l’appareil', 'offline — progresso mantido no dispositivo', 'offline — progressi salvati sul dispositivo'],
    ['Player {id}', 'Jugador {id}', 'Spieler {id}', 'Joueur {id}', 'Jogador {id}', 'Giocatore {id}'],

    // ---- modes
    ['Choose a mode', 'Elige un modo', 'Modus wählen', 'Choisissez un mode', 'Escolha um modo', 'Scegli una modalità'],
    ['Play', 'Jugar', 'Spielen', 'Jouer', 'Jogar', 'Gioca'],
    ['Three short interactive lessons. Unranked, about a minute each.', 'Tres lecciones interactivas cortas. Sin clasificación, alrededor de un minuto cada una.', 'Drei kurze interaktive Lektionen. Ungewertet, je etwa eine Minute.', 'Trois courtes leçons interactives. Non classées, environ une minute chacune.', 'Três lições interativas curtas. Sem ranking, cerca de um minuto cada.', 'Tre brevi lezioni interattive. Non classificate, circa un minuto ciascuna.'],
    ['40 stages of rising difficulty. Mastery trial every 8th stage. Progress is saved.', '40 etapas de dificultad creciente. Prueba de maestría cada 8 etapas. El progreso se guarda.', '40 Etappen mit steigender Schwierigkeit. Meisterprüfung jede 8. Etappe. Der Fortschritt wird gespeichert.', '40 étapes de difficulté croissante. Épreuve de maîtrise toutes les 8 étapes. La progression est enregistrée.', '40 etapas de dificuldade crescente. Prova de maestria a cada 8 etapas. O progresso é salvo.', '40 tappe di difficoltà crescente. Prova di maestria ogni 8 tappe. I progressi vengono salvati.'],
    ['One shared seed per UTC day. Ranked on the leaderboard.', 'Una semilla compartida por día UTC. Cuenta para la clasificación.', 'Ein gemeinsamer Seed pro UTC-Tag. In der Bestenliste gewertet.', 'Une graine commune par jour UTC. Classé au classement.', 'Uma semente compartilhada por dia UTC. Vale para o ranking.', 'Un seme condiviso per giorno UTC. Conta per la classifica.'],
    ['Practice', 'Práctica', 'Training', 'Entraînement', 'Treino', 'Allenamento'],
    ['Pick a difficulty 1–5. Unranked, restart freely.', 'Elige una dificultad del 1 al 5. Sin clasificación, reinicia cuando quieras.', 'Wähle Schwierigkeit 1–5. Ungewertet, jederzeit neu starten.', 'Choisissez une difficulté de 1 à 5. Non classé, recommencez à volonté.', 'Escolha uma dificuldade de 1 a 5. Sem ranking, reinicie à vontade.', 'Scegli una difficoltà da 1 a 5. Non classificata, ricomincia quando vuoi.'],
    ['Challenge', 'Desafío', 'Herausforderung', 'Défi', 'Desafio', 'Sfida'],
    ['Constrained variants: a move-limit course and a speed course. Unranked.', 'Variantes con restricciones: un recorrido con límite de acciones y uno de velocidad. Sin clasificación.', 'Varianten mit Vorgaben: eine Strecke mit Aktionslimit und eine Tempostrecke. Ungewertet.', 'Variantes contraintes : un parcours à actions limitées et un parcours de vitesse. Non classé.', 'Variantes com restrições: um percurso com limite de ações e um de velocidade. Sem ranking.', 'Varianti vincolate: un percorso con limite di azioni e uno di velocità. Non classificate.'],
    ['Back', 'Volver', 'Zurück', 'Retour', 'Voltar', 'Indietro'],
    ['Stage {n}', 'Etapa {n}', 'Etappe {n}', 'Étape {n}', 'Etapa {n}', 'Tappa {n}'],
    ['mastery trial', 'prueba de maestría', 'Meisterprüfung', 'épreuve de maîtrise', 'prova de maestria', 'prova di maestria'],
    ['Locked', 'Bloqueada', 'Gesperrt', 'Verrouillée', 'Bloqueada', 'Bloccata'],
    ['Best: {n}', 'Mejor: {n}', 'Bestwert: {n}', 'Record : {n}', 'Melhor: {n}', 'Record: {n}'],
    ['Not cleared yet', 'Aún sin superar', 'Noch nicht geschafft', 'Pas encore réussie', 'Ainda não concluída', 'Non ancora superata'],
    ['Gold-bordered stages are mastery trials.', 'Las etapas con borde dorado son pruebas de maestría.', 'Etappen mit goldenem Rand sind Meisterprüfungen.', 'Les étapes au contour doré sont des épreuves de maîtrise.', 'Etapas com borda dourada são provas de maestria.', 'Le tappe con il bordo dorato sono prove di maestria.'],
    ['Select a difficulty. Unranked; restart any time.', 'Elige una dificultad. Sin clasificación; reinicia cuando quieras.', 'Wähle eine Schwierigkeit. Ungewertet; jederzeit neu starten.', 'Choisissez une difficulté. Non classé ; recommencez à tout moment.', 'Escolha uma dificuldade. Sem ranking; reinicie quando quiser.', 'Scegli una difficoltà. Non classificata; ricomincia quando vuoi.'],
    ['Move Limit', 'Límite de acciones', 'Aktionslimit', 'Actions limitées', 'Limite de ações', 'Limite di azioni'],
    ['Finish the course using at most 24 actions. Every jump and form change counts.', 'Termina el recorrido con 24 acciones como máximo. Cada salto y cambio de forma cuenta.', 'Beende die Strecke mit höchstens 24 Aktionen. Jeder Sprung und Formwechsel zählt.', 'Terminez le parcours en 24 actions au plus. Chaque saut et changement de forme compte.', 'Termine o percurso com no máximo 24 ações. Cada pulo e troca de forma conta.', 'Completa il percorso con al massimo 24 azioni. Ogni salto e cambio di forma conta.'],
    ['Speed Target', 'Meta de velocidad', 'Zeitziel', 'Objectif vitesse', 'Meta de velocidade', 'Obiettivo velocità'],
    ['Maximum speed course. Finish in 19 seconds or better.', 'Recorrido a velocidad máxima. Termina en 19 segundos o menos.', 'Strecke mit Höchsttempo. Schaffe sie in 19 Sekunden oder schneller.', 'Parcours à vitesse maximale. Terminez en 19 secondes ou moins.', 'Percurso em velocidade máxima. Termine em 19 segundos ou menos.', 'Percorso a velocità massima. Completalo in 19 secondi o meno.'],

    // ---- pause, results
    ['Paused', 'En pausa', 'Pausiert', 'En pause', 'Pausado', 'In pausa'],
    ['Resume', 'Reanudar', 'Weiter', 'Reprendre', 'Continuar', 'Riprendi'],
    ['Restart run', 'Reiniciar partida', 'Lauf neu starten', 'Recommencer la course', 'Reiniciar corrida', 'Ricomincia la corsa'],
    ['Leave to title', 'Salir al título', 'Zum Titelbildschirm', 'Retour à l’écran titre', 'Sair para o título', 'Torna al titolo'],
    ['Checkpoints', 'Puntos de control', 'Kontrollpunkte', 'Points de contrôle', 'Checkpoints', 'Checkpoint'],
    ['Gems', 'Gemas', 'Edelsteine', 'Gemmes', 'Gemas', 'Gemme'],
    ['Finish bonus', 'Bono por terminar', 'Zielbonus', 'Bonus d’arrivée', 'Bônus de chegada', 'Bonus arrivo'],
    ['Attempt penalty', 'Penalización por intentos', 'Versuchsabzug', 'Pénalité d’essais', 'Penalidade por tentativas', 'Penalità tentativi'],
    ['Total', 'Total', 'Gesamt', 'Total', 'Total', 'Totale'],
    ['Best score: {n}', 'Mejor puntuación: {n}', 'Bestwert: {n}', 'Meilleur score : {n}', 'Melhor pontuação: {n}', 'Miglior punteggio: {n}'],
    ['Retry', 'Reintentar', 'Nochmal', 'Réessayer', 'Tentar de novo', 'Riprova'],
    ['Next stage', 'Siguiente etapa', 'Nächste Etappe', 'Étape suivante', 'Próxima etapa', 'Tappa successiva'],
    ['Mode select', 'Elegir modo', 'Moduswahl', 'Choix du mode', 'Escolher modo', 'Scelta modalità'],
    ['Title', 'Título', 'Titel', 'Titre', 'Título', 'Titolo'],
    ['{headline}. Total score {n}.', '{headline}. Puntuación total: {n}.', '{headline}. Gesamtpunktzahl {n}.', '{headline}. Score total : {n}.', '{headline}. Pontuação total: {n}.', '{headline}. Punteggio totale: {n}.'],
    ['STAGE CLEAR!', '¡ETAPA SUPERADA!', 'ETAPPE GESCHAFFT!', 'ÉTAPE RÉUSSIE !', 'ETAPA CONCLUÍDA!', 'TAPPA SUPERATA!'],
    ['CLEAR — CHALLENGE FAILED', 'SUPERADA, PERO DESAFÍO FALLIDO', 'GESCHAFFT – HERAUSFORDERUNG VERFEHLT', 'RÉUSSIE — DÉFI ÉCHOUÉ', 'CONCLUÍDA — DESAFIO FALHOU', 'SUPERATA — SFIDA FALLITA'],
    ['WIPED OUT', 'ELIMINADO', 'AUSGESCHIEDEN', 'ÉLIMINÉ', 'ELIMINADO', 'ELIMINATO'],
    ['Time {t}s · {jumps} jumps · {forms} form changes', 'Tiempo {t} s · {jumps} saltos · {forms} cambios de forma', 'Zeit {t} s · {jumps} Sprünge · {forms} Formwechsel', 'Temps {t} s · {jumps} sauts · {forms} changements de forme', 'Tempo {t} s · {jumps} pulos · {forms} trocas de forma', 'Tempo {t} s · {jumps} salti · {forms} cambi di forma'],
    ['Move limit exceeded ({n}/{max}).', 'Límite de acciones superado ({n}/{max}).', 'Aktionslimit überschritten ({n}/{max}).', 'Limite d’actions dépassée ({n}/{max}).', 'Limite de ações excedido ({n}/{max}).', 'Limite di azioni superato ({n}/{max}).'],
    ['Too slow ({t}s, target {target}s).', 'Demasiado lento ({t} s, meta {target} s).', 'Zu langsam ({t} s, Ziel {target} s).', 'Trop lent ({t} s, objectif {target} s).', 'Lento demais ({t} s, meta {target} s).', 'Troppo lento ({t} s, obiettivo {target} s).'],
    ['Your best is saved to your account.', 'Tu mejor marca se guarda en tu cuenta.', 'Dein Bestwert wird in deinem Konto gespeichert.', 'Votre record est enregistré dans votre compte.', 'Seu recorde fica salvo na sua conta.', 'Il tuo record viene salvato nel tuo account.'],
    ['Daily board — platform', 'Clasificación diaria: plataforma', 'Tagesbestenliste – Plattform', 'Classement du jour — plateforme', 'Ranking diário — plataforma', 'Classifica giornaliera — piattaforma'],
    ['No entries yet today.', 'Todavía no hay registros hoy.', 'Heute noch keine Einträge.', 'Aucune entrée aujourd’hui pour l’instant.', 'Nenhuma entrada hoje ainda.', 'Ancora nessun risultato oggi.'],
    ['Your platform rank: {n}.', 'Tu puesto en la plataforma: {n}.', 'Dein Platz auf der Plattform: {n}.', 'Votre rang sur la plateforme : {n}.', 'Sua posição na plataforma: {n}.', 'La tua posizione sulla piattaforma: {n}.'],
    ['Daily board', 'Clasificación diaria', 'Tagesbestenliste', 'Classement du jour', 'Ranking diário', 'Classifica giornaliera'],
    ['No platform leaderboard for this game yet — your best is saved to your account.', 'Este juego aún no tiene clasificación en la plataforma; tu mejor marca se guarda en tu cuenta.', 'Für dieses Spiel gibt es noch keine Plattform-Bestenliste – dein Bestwert wird in deinem Konto gespeichert.', 'Pas encore de classement sur la plateforme pour ce jeu — votre record est enregistré dans votre compte.', 'Ainda não há ranking da plataforma para este jogo — seu recorde fica salvo na sua conta.', 'Questo gioco non ha ancora una classifica sulla piattaforma: il tuo record viene salvato nel tuo account.'],
    ['Go!', '¡Ya!', 'Los!', 'Partez !', 'Vai!', 'Via!'],

    // ---- objectives
    ['Lesson 1: press JUMP (Space) to clear the amber slabs.', 'Lección 1: pulsa SALTAR (Espacio) para superar los bloques ámbar.', 'Lektion 1: Drücke SPRUNG (Leertaste), um die bernsteinfarbenen Blöcke zu überspringen.', 'Leçon 1 : appuyez sur SAUTER (Espace) pour franchir les dalles ambre.', 'Lição 1: aperte PULAR (Espaço) para passar pelos blocos âmbar.', 'Lezione 1: premi SALTA (Spazio) per superare i blocchi ambra.'],
    ['Lesson 2: press FORM (F) to become NOVA and phase through the violet gates.', 'Lección 2: pulsa FORMA (F) para volverte NOVA y atravesar las puertas violetas.', 'Lektion 2: Drücke FORM (F), um zu NOVA zu werden und durch die violetten Tore zu gleiten.', 'Leçon 2 : appuyez sur FORME (F) pour devenir NOVA et traverser les portes violettes.', 'Lição 2: aperte FORMA (F) para virar NOVA e atravessar os portões violeta.', 'Lezione 2: premi FORMA (F) per diventare NOVA e attraversare i portali viola.'],
    ['Lesson 3: combine jumps and form changes to reach the beacon.', 'Lección 3: combina saltos y cambios de forma para llegar a la baliza.', 'Lektion 3: Kombiniere Sprünge und Formwechsel, um das Leuchtfeuer zu erreichen.', 'Leçon 3 : combinez sauts et changements de forme pour atteindre la balise.', 'Lição 3: combine pulos e trocas de forma para chegar ao farol.', 'Lezione 3: combina salti e cambi di forma per raggiungere il faro.'],
    ['Move limit: finish using at most {n} actions.', 'Límite de acciones: termina con {n} acciones como máximo.', 'Aktionslimit: Ziel mit höchstens {n} Aktionen erreichen.', 'Actions limitées : terminez en {n} actions au plus.', 'Limite de ações: termine com no máximo {n} ações.', 'Limite di azioni: arriva con al massimo {n} azioni.'],
    ['Speed target: finish in under {n} seconds.', 'Meta de velocidad: termina en menos de {n} segundos.', 'Zeitziel: in unter {n} Sekunden ins Ziel.', 'Objectif vitesse : terminez en moins de {n} secondes.', 'Meta de velocidade: termine em menos de {n} segundos.', 'Obiettivo velocità: arriva in meno di {n} secondi.'],
    ['Reach the beacon. Jump amber slabs; phase violet gates as NOVA.', 'Llega a la baliza. Salta los bloques ámbar; atraviesa las puertas violetas como NOVA.', 'Erreiche das Leuchtfeuer. Spring über bernsteinfarbene Blöcke; gleite als NOVA durch violette Tore.', 'Atteignez la balise. Sautez les dalles ambre ; traversez les portes violettes en NOVA.', 'Chegue ao farol. Pule os blocos âmbar; atravesse os portões violeta como NOVA.', 'Raggiungi il faro. Salta i blocchi ambra; attraversa i portali viola come NOVA.'],

    // ---- achievements
    ['First Clear', 'Primera etapa superada', 'Erste Etappe geschafft', 'Première réussite', 'Primeira conclusão', 'Prima tappa superata'],
    ['Journey Complete', 'Travesía completada', 'Reise abgeschlossen', 'Voyage terminé', 'Jornada concluída', 'Viaggio completato'],
    ['Tutorial Graduate', 'Tutorial superado', 'Tutorial bestanden', 'Diplômé du tutoriel', 'Tutorial concluído', 'Tutorial superato'],
    ['Oof', 'Uf', 'Autsch', 'Aïe', 'Ai', 'Ahia'],
    ['Seven-Day Pulse', 'Pulso de siete días', 'Sieben-Tage-Puls', 'Pouls de sept jours', 'Pulso de sete dias', 'Battito di sette giorni'],
    ['Achievement unlocked: {name}.', 'Logro desbloqueado: {name}.', 'Erfolg freigeschaltet: {name}.', 'Succès débloqué : {name}.', 'Conquista desbloqueada: {name}.', 'Obiettivo sbloccato: {name}.'],

    // ---- help
    ['How to play', 'Cómo jugar', 'So wird gespielt', 'Comment jouer', 'Como jogar', 'Come si gioca'],
    ['Jump', 'Saltar', 'Springen', 'Sauter', 'Pular', 'Salto'],
    ['Press {keys}, or tap the right side to jump. Jumping clears the low amber slabs.', 'Pulsa {keys} o toca el lado derecho para saltar. Al saltar superas los bloques ámbar bajos.', 'Drücke {keys} oder tippe rechts, um zu springen. Sprünge überwinden die niedrigen bernsteinfarbenen Blöcke.', 'Appuyez sur {keys} ou touchez le côté droit pour sauter. Sauter franchit les dalles ambre basses.', 'Aperte {keys} ou toque no lado direito para pular. Pular passa pelos blocos âmbar baixos.', 'Premi {keys} o tocca il lato destro per saltare. Saltando superi i blocchi ambra bassi.'],
    ['Form change', 'Cambio de forma', 'Formwechsel', 'Changement de forme', 'Troca de forma', 'Cambio di forma'],
    ['Press {keys}, or tap the left side to switch between PULSE (cyan sphere) and NOVA (magenta, wide halo). Tall violet gates can only be phased through as NOVA.', 'Pulsa {keys} o toca el lado izquierdo para alternar entre PULSE (esfera cian) y NOVA (magenta, halo amplio). Las puertas violetas altas solo se atraviesan como NOVA.', 'Drücke {keys} oder tippe links, um zwischen PULSE (cyanfarbene Kugel) und NOVA (magenta, weiter Halo) zu wechseln. Durch hohe violette Tore kommst du nur als NOVA.', 'Appuyez sur {keys} ou touchez le côté gauche pour passer de PULSE (sphère cyan) à NOVA (magenta, large halo). Les hautes portes violettes ne se traversent qu’en NOVA.', 'Aperte {keys} ou toque no lado esquerdo para alternar entre PULSE (esfera ciano) e NOVA (magenta, halo largo). Os portões violeta altos só podem ser atravessados como NOVA.', 'Premi {keys} o tocca il lato sinistro per passare da PULSE (sfera ciano) a NOVA (magenta, alone ampio). I portali viola alti si attraversano solo come NOVA.'],
    ['Scoring', 'Puntuación', 'Wertung', 'Score', 'Pontuação', 'Punteggio'],
    ['Checkpoints +50, gems +25, finishing +500. Each failed attempt on a stage costs 10 points (max 100).', 'Puntos de control +50, gemas +25, terminar +500. Cada intento fallido en una etapa resta 10 puntos (máx. 100).', 'Kontrollpunkte +50, Edelsteine +25, Ziel +500. Jeder gescheiterte Versuch einer Etappe kostet 10 Punkte (max. 100).', 'Points de contrôle +50, gemmes +25, arrivée +500. Chaque essai raté sur une étape coûte 10 points (100 max.).', 'Checkpoints +50, gemas +25, chegada +500. Cada tentativa fracassada em uma etapa custa 10 pontos (máx. 100).', 'Checkpoint +50, gemme +25, arrivo +500. Ogni tentativo fallito in una tappa costa 10 punti (max 100).'],
    ['Pause', 'Pausa', 'Pause', 'Pause', 'Pausa', 'Pausa'],
    ['Press {keys}, or the II button. The game pauses automatically when the tab is hidden.', 'Pulsa {keys} o el botón II. El juego se pausa solo cuando la pestaña está oculta.', 'Drücke {keys} oder die Taste II. Das Spiel pausiert automatisch, wenn der Tab verborgen ist.', 'Appuyez sur {keys} ou sur le bouton II. Le jeu se met en pause automatiquement quand l’onglet est masqué.', 'Aperte {keys} ou o botão II. O jogo pausa sozinho quando a aba fica oculta.', 'Premi {keys} o il pulsante II. Il gioco va in pausa da solo quando la scheda è nascosta.'],
    ['{a} or {b}', '{a} o {b}', '{a} oder {b}', '{a} ou {b}', '{a} ou {b}', '{a} o {b}'],
    ['Space', 'Espacio', 'Leertaste', 'Espace', 'Espaço', 'Spazio'],

    // ---- settings
    ['Left-handed touch controls', 'Controles táctiles para zurdos', 'Touch-Steuerung für Linkshänder', 'Commandes tactiles pour gauchers', 'Controles de toque para canhotos', 'Comandi touch per mancini'],
    ['Timing assist (landing marker)', 'Ayuda de ritmo (marca de aterrizaje)', 'Timing-Hilfe (Landemarkierung)', 'Aide au timing (repère d’atterrissage)', 'Assistência de ritmo (marca de pouso)', 'Aiuto tempismo (segno di atterraggio)'],
    ['Open Options', 'Abrir Opciones', 'Optionen öffnen', 'Ouvrir les options', 'Abrir Opções', 'Apri Opzioni'],
    ['Sound, graphics, language, reduced motion, high contrast and larger text are in the StarHermit Options.',
      'El sonido, los gráficos, el idioma, el movimiento reducido, el alto contraste y el texto más grande están en las Opciones de StarHermit.',
      'Ton, Grafik, Sprache, weniger Bewegung, hoher Kontrast und größere Schrift findest du in den StarHermit-Optionen.',
      'Le son, les graphismes, la langue, les animations réduites, le contraste élevé et le texte plus grand se trouvent dans les options StarHermit.',
      'Som, gráficos, idioma, movimento reduzido, alto contraste e texto maior ficam nas Opções do StarHermit.',
      'Audio, grafica, lingua, movimento ridotto, contrasto elevato e testo più grande sono nelle Opzioni di StarHermit.']
  ];

  var COLS = ['es-419', 'de-DE', 'fr-FR', 'pt-BR', 'it-IT'];
  var T = { 'en-US': {} };
  COLS.forEach(function (loc) { T[loc] = {}; });
  ROWS.forEach(function (row) { COLS.forEach(function (loc, i) { T[loc][row[0]] = row[i + 1]; }); });

  // en-GB: no differences from en-US in this game's text.
  T['en-GB'] = {};
  // es-ES: Spain Spanish wording.
  T['es-ES'] = {
    'Settings': 'Ajustes'
  };
  // fr-CA: Canadian French (pointage for score).
  T['fr-CA'] = {
    'SCORE': 'POINTAGE',
    'Best score: {n}': 'Meilleur pointage : {n}',
    '{headline}. Total score {n}.': '{headline}. Pointage total : {n}.',
    'Scoring': 'Pointage',
    'Checkpoints +50, gems +25, finishing +500. Each failed attempt on a stage costs 10 points (max 100).': 'Points de contrôle +50, gemmes +25, arrivée +500. Chaque essai raté sur une étape coûte 10 points (100 max.).'
  };

  root.PJ_STRINGS = T;
})(globalThis);
