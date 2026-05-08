<!DOCTYPE html>
<html lang="fr">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>Partage Ton Serveur</title>

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
      background:#111111;
      color:white;
    }

    header{
      height:90vh;
      display:flex;
      justify-content:center;
      align-items:center;
      text-align:center;
      padding:20px;
      background:#181818;
      border-bottom:4px solid orange;
    }

    .hero{
      max-width:900px;
    }

    .hero h1{
      font-size:70px;
      color:orange;
      margin-bottom:25px;
    }

    .hero p{
      font-size:22px;
      color:#d1d5db;
      line-height:1.8;
    }

    .btn{
      display:inline-block;
      margin-top:35px;
      padding:15px 35px;
      background:orange;
      color:black;
      text-decoration:none;
      border-radius:12px;
      font-weight:700;
      transition:.3s;
    }

    .btn:hover{
      transform:translateY(-5px);
    }

    section{
      padding:100px 10%;
    }

    .title{
      text-align:center;
      font-size:50px;
      margin-bottom:70px;
      color:orange;
    }

    .about{
      background:#1c1c1c;
      padding:50px;
      border-radius:20px;
      line-height:2;
      color:#d1d5db;
      font-size:18px;
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
      background:orange;
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

    .left{
      left:0;
    }

    .right{
      left:50%;
    }

    .content{
      background:orange;
      color:black;
      padding:30px;
      border-radius:20px;
      box-shadow:0 0 20px rgba(0,0,0,.4);
    }

    .content h3{
      margin-bottom:15px;
      font-size:26px;
    }

    .content p{
      line-height:1.7;
      font-weight:500;
    }

    .stats{
      display:grid;
      grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
      gap:30px;
      margin-top:50px;
    }

    .stat{
      background:#1c1c1c;
      padding:40px;
      border-radius:20px;
      text-align:center;
      border-top:4px solid orange;
    }

    .stat h2{
      color:orange;
      font-size:50px;
      margin-bottom:10px;
    }

    footer{
      background:#181818;
      text-align:center;
      padding:40px;
      color:#9ca3af;
      border-top:4px solid orange;
    }

    @media(max-width:900px){

      .hero h1{
        font-size:45px;
      }

      .hero p{
        font-size:18px;
      }

      .timeline::after{
        left:20px;
      }

      .container{
        width:100%;
        padding-left:60px;
        padding-right:20px;
      }

      .right{
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
      Une plateforme communautaire dédiée à la publicité,
      au partage et au développement des serveurs Discord.
    </p>

    <a href="https://discord.gg/votrecode" class="btn">
      Rejoindre le serveur
    </a>

  </div>

</header>

<section>

  <h1 class="title">
    🌍 À propos
  </h1>

  <div class="about">

    <p>
      Partage-Ton-Serveur a été créé pour permettre aux communautés Discord
      de gagner en visibilité et de développer leur activité.
    </p>

    <br>

    <p>
      Au fil des années, le projet a évolué avec de nouveaux systèmes,
      une meilleure organisation et une communauté toujours plus active.
    </p>

    <br>

    <p>
      Aujourd’hui, le serveur continue de grandir avec l’objectif
      de devenir une référence dans la publicité Discord francophone.
    </p>

  </div>

</section>

<section>

  <h1 class="title">
    📖 Le parcours du serveur
  </h1>

  <div class="timeline">

    <div class="container left">

      <div class="content">

        <h3>2020</h3>

        <p>
          Création du serveur avec les premiers salons de publicité
          et une petite communauté active.
        </p>

      </div>

    </div>

    <div class="container right">

      <div class="content">

        <h3>2021</h3>

        <p>
          Développement du serveur avec l’arrivée
          des premiers partenariats Discord.
        </p>

      </div>

    </div>

    <div class="container left">

      <div class="content">

        <h3>2022</h3>

        <p>
          Refonte de l’organisation et amélioration
          des systèmes de publicité.
        </p>

      </div>

    </div>

    <div class="container right">

      <div class="content">

        <h3>2023</h3>

        <p>
          Forte croissance de la communauté
          avec davantage de membres actifs.
        </p>

      </div>

    </div>

    <div class="container left">

      <div class="content">

        <h3>2024</h3>

        <p>
          Nouvelle identité visuelle et amélioration
          de l’expérience utilisateur.
        </p>

      </div>

    </div>

    <div class="container right">

      <div class="content">

        <h3>2025</h3>

        <p>
          Développement du site officiel
          et modernisation complète du projet.
        </p>

      </div>

    </div>

    <div class="container left">

      <div class="content">

        <h3>2026</h3>

        <p>
          Expansion de la plateforme avec de nouveaux objectifs
          pour devenir une référence Discord francophone.
        </p>

      </div>

    </div>

  </div>

</section>

<section>

  <h1 class="title">
    📊 Statistiques
  </h1>

  <div class="stats">

    <div class="stat">
      <h2>1000+</h2>
      <p>Membres</p>
    </div>

    <div class="stat">
      <h2>500+</h2>
      <p>Publicités</p>
    </div>

    <div class="stat">
      <h2>24/7</h2>
      <p>Activité</p>
    </div>

    <div class="stat">
      <h2>2020</h2>
      <p>Création</p>
    </div>

  </div>

</section>

<footer>

  © 2026 Partage-Ton-Serveur — Tous droits réservés

</footer>

</body>

</html>
