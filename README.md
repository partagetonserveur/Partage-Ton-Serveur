# Partage Ton Serveur
<!DOCTYPE html>
<html lang="fr">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>Partage-Ton-Serveur</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;700&display=swap" rel="stylesheet">

  <style>

    *{
      margin:0;
      padding:0;
      box-sizing:border-box;
      scroll-behavior:smooth;
    }

    body{
      font-family:'Poppins',sans-serif;
      background:#070b14;
      color:white;
      overflow-x:hidden;
    }

    header{
      height:100vh;
      background:
      linear-gradient(rgba(7,11,20,.85),rgba(7,11,20,.95)),
      url('https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1600&auto=format&fit=crop');
      background-size:cover;
      background-position:center;
      display:flex;
      justify-content:center;
      align-items:center;
      text-align:center;
      padding:20px;
      position:relative;
    }

    .hero{
      max-width:900px;
      animation:fade 1.2s ease;
    }

    .hero h1{
      font-size:80px;
      color:#5865F2;
      margin-bottom:25px;
      text-shadow:0 0 25px rgba(88,101,242,.5);
    }

    .hero p{
      font-size:24px;
      line-height:1.8;
      color:#d1d5db;
    }

    .buttons{
      margin-top:40px;
    }

    .btn{
      display:inline-block;
      padding:15px 35px;
      margin:10px;
      border-radius:14px;
      text-decoration:none;
      font-weight:600;
      transition:.3s;
    }

    .btn-primary{
      background:#5865F2;
      color:white;
      box-shadow:0 0 20px rgba(88,101,242,.5);
    }

    .btn-primary:hover{
      transform:translateY(-5px);
    }

    .btn-secondary{
      border:2px solid white;
      color:white;
    }

    section{
      padding:110px 10%;
    }

    .title{
      text-align:center;
      font-size:50px;
      margin-bottom:70px;
      color:#5865F2;
    }

    .about{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:60px;
      align-items:center;
    }

    .about img{
      width:100%;
      border-radius:25px;
      box-shadow:0 0 30px rgba(0,0,0,.5);
    }

    .about-text h2{
      font-size:42px;
      margin-bottom:25px;
    }

    .about-text p{
      color:#cbd5e1;
      line-height:2;
      margin-bottom:20px;
      font-size:17px;
    }

    .timeline{
      position:relative;
      max-width:1000px;
      margin:auto;
    }

    .timeline::after{
      content:'';
      position:absolute;
      width:4px;
      background:#5865F2;
      top:0;
      bottom:0;
      left:50%;
      margin-left:-2px;
    }

    .container{
      padding:20px 40px;
      position:relative;
      width:50%;
    }

    .container.left{
      left:0;
    }

    .container.right{
      left:50%;
    }

    .content{
      background:#111827;
      padding:30px;
      border-radius:20px;
      box-shadow:0 0 20px rgba(0,0,0,.3);
    }

    .content h3{
      margin-bottom:15px;
      color:#5865F2;
    }

    .content p{
      color:#cbd5e1;
      line-height:1.7;
    }

    .stats{
      display:grid;
      grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
      gap:30px;
      margin-top:50px;
    }

    .stat{
      background:#111827;
      padding:40px;
      text-align:center;
      border-radius:20px;
    }

    .stat h2{
      color:#5865F2;
      font-size:50px;
      margin-bottom:10px;
    }

    footer{
      background:#020617;
      text-align:center;
      padding:50px;
      color:#94a3b8;
    }

    @keyframes fade{
      from{
        opacity:0;
        transform:translateY(30px);
      }

      to{
        opacity:1;
        transform:translateY(0);
      }
    }

    @media(max-width:900px){

      .hero h1{
        font-size:50px;
      }

      .hero p{
        font-size:18px;
      }

      .about{
        grid-template-columns:1fr;
      }

      .timeline::after{
        left:20px;
      }

      .container{
        width:100%;
        padding-left:60px;
        padding-right:20px;
      }

      .container.right{
        left:0;
      }

    }

  </style>

</head>

<body>

<header>

  <div class="hero">

    <h1>🚀 Partage-Ton-Serveur</h1>

    <p>
      Bien plus qu’un simple serveur Discord.
      Une aventure communautaire construite année après année
      autour du partage, de la publicité et de la passion.
    </p>

    <div class="buttons">

      <a href="https://discord.gg/votrecode" class="btn btn-primary">
        Rejoindre le serveur
      </a>

      <a href="#parcours" class="btn btn-secondary">
        Découvrir notre parcours
      </a>

    </div>

  </div>

</header>

<section>

  <h1 class="title">
    🌍 Notre histoire
  </h1>

  <div class="about">

    <img src="https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=1200&auto=format&fit=crop">

    <div class="about-text">

      <h2>Une communauté créée avec passion</h2>

      <p>
        Partage-Ton-Serveur est né avec une idée simple :
        aider les créateurs Discord à faire connaître leurs communautés.
      </p>

      <p>
        Au début, le projet était petit, avec seulement quelques membres.
        Mais grâce à la passion, à l’activité et à l’entraide,
        le serveur a grandi au fil des années.
      </p>

      <p>
        Aujourd’hui, nous continuons de développer une plateforme moderne
        dédiée à la publicité Discord et à la découverte de nouvelles communautés.
      </p>

    </div>

  </div>

</section>

<section id="parcours">

  <h1 class="title">
    📖 Le parcours du serveur
  </h1>

  <div class="timeline">

    <div class="container left">

      <div class="content">

        <h3>2022 — Création du projet</h3>

        <p>
          Lancement de Partage-Ton-Serveur avec une petite communauté
          centrée sur la publicité Discord.
        </p>

      </div>

    </div>

    <div class="container right">

      <div class="content">

        <h3>2023 — Croissance rapide</h3>

        <p>
          Arrivée de nombreux nouveaux membres,
          amélioration des salons et développement de nouveaux partenariats.
        </p>

      </div>

    </div>

    <div class="container left">

      <div class="content">

        <h3>2024 — Nouvelle identité</h3>

        <p>
          Refonte complète du serveur avec une meilleure organisation,
          des événements et une publicité plus professionnelle.
        </p>

      </div>

    </div>

    <div class="container right">

      <div class="content">

        <h3>2025 — Expansion</h3>

        <p>
          Développement du site officiel et création
          d’une vraie plateforme de mise en avant Discord.
        </p>

      </div>

    </div>

  </div>

</section>

<section>

  <h1 class="title">
    📊 Nos statistiques
  </h1>

  <div class="stats">

    <div class="stat">
      <h2>1000+</h2>
      <p>Membres actifs</p>
    </div>

    <div class="stat">
      <h2>500+</h2>
      <p>Serveurs publiés</p>
    </div>

    <div class="stat">
      <h2>24/7</h2>
      <p>Communauté active</p>
    </div>

    <div class="stat">
      <h2>2022</h2>
      <p>Année de création</p>
    </div>

  </div>

</section>

<footer>

  © 2026 Partage-Ton-Serveur — Une communauté Discord en évolution constante 🚀

</footer>

</body>

</html>
