# Partage Ton Serveur
Plateforme de partage et de publicité de serveurs Discord
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>Partage-Ton-Serveur</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet">

  <style>

    *{
      margin:0;
      padding:0;
      box-sizing:border-box;
    }

    body{
      font-family:'Poppins',sans-serif;
      background:#0f172a;
      color:white;
      overflow-x:hidden;
    }

    header{
      height:100vh;
      background:
      linear-gradient(rgba(15,23,42,.8),rgba(15,23,42,.9)),
      url('https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=1600&auto=format&fit=crop');
      background-size:cover;
      background-position:center;
      display:flex;
      justify-content:center;
      align-items:center;
      text-align:center;
      padding:20px;
    }

    .hero h1{
      font-size:70px;
      color:#5865F2;
      margin-bottom:20px;
    }

    .hero p{
      font-size:22px;
      color:#d1d5db;
      max-width:800px;
      margin:auto;
      line-height:1.6;
    }

    .buttons{
      margin-top:35px;
    }

    .btn{
      display:inline-block;
      padding:14px 30px;
      border-radius:12px;
      text-decoration:none;
      margin:10px;
      transition:0.3s;
      font-weight:600;
    }

    .btn-primary{
      background:#5865F2;
      color:white;
    }

    .btn-primary:hover{
      transform:scale(1.05);
    }

    .btn-secondary{
      border:2px solid white;
      color:white;
    }

    .section{
      padding:100px 10%;
    }

    .section-title{
      text-align:center;
      font-size:42px;
      margin-bottom:60px;
      color:#5865F2;
    }

    .cards{
      display:grid;
      grid-template-columns:repeat(auto-fit,minmax(280px,1fr));
      gap:30px;
    }

    .card{
      background:#1e293b;
      padding:30px;
      border-radius:20px;
      transition:0.3s;
      border:1px solid rgba(255,255,255,0.05);
    }

    .card:hover{
      transform:translateY(-10px);
      background:#273549;
    }

    .card h3{
      margin-bottom:15px;
      color:#fff;
      font-size:24px;
    }

    .card p{
      color:#cbd5e1;
      line-height:1.7;
    }

    .story{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:50px;
      align-items:center;
    }

    .story img{
      width:100%;
      border-radius:20px;
    }

    .story-text h2{
      font-size:42px;
      margin-bottom:20px;
      color:#5865F2;
    }

    .story-text p{
      line-height:1.8;
      color:#d1d5db;
      margin-bottom:20px;
    }

    footer{
      text-align:center;
      padding:40px;
      background:#020617;
      color:#94a3b8;
    }

    @media(max-width:900px){

      .hero h1{
        font-size:45px;
      }

      .story{
        grid-template-columns:1fr;
      }

    }

  </style>
</head>

<body>

<header>

  <div class="hero">

    <h1>🚀 Partage-Ton-Serveur</h1>

    <p>
      La plateforme française pour promouvoir, découvrir
      et faire grandir les meilleurs serveurs Discord.
    </p>

    <div class="buttons">

      <a href="https://discord.gg/votrecode" class="btn btn-primary">
        Rejoindre Discord
      </a>

      <a href="#parcours" class="btn btn-secondary">
        Notre Histoire
      </a>

    </div>

  </div>

</header>

<section class="section">

  <h2 class="section-title">
    Pourquoi choisir notre plateforme ?
  </h2>

  <div class="cards">

    <div class="card">
      <h3>🔥 Publicité rapide</h3>
      <p>
        Faites connaître votre serveur Discord à une large communauté active.
      </p>
    </div>

    <div class="card">
      <h3>🌍 Communauté active</h3>
      <p>
        Des membres passionnés dans plusieurs catégories :
        gaming, chill, RP, développement et plus.
      </p>
    </div>

    <div class="card">
      <h3>🚀 Croissance</h3>
      <p>
        Développez votre communauté grâce à notre système
        de mise en avant et de partage.
      </p>
    </div>

  </div>

</section>

<section class="section" id="parcours">

  <div class="story">

    <img src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1200&auto=format&fit=crop">

    <div class="story-text">

      <h2>📖 Le parcours du serveur</h2>

      <p>
        Partage-Ton-Serveur a commencé comme un petit projet
        communautaire créé pour aider les créateurs de serveurs
        Discord à gagner en visibilité.
      </p>

      <p>
        Au fil du temps, la communauté a grandi avec des centaines
        de membres partageant leurs passions, leurs projets et leurs
        communautés.
      </p>

      <p>
        Aujourd’hui, notre objectif est simple :
        devenir une référence française dans la publicité
        et la découverte de serveurs Discord.
      </p>

    </div>

  </div>

</section>

<section class="section">

  <h2 class="section-title">
    🌟 Serveurs populaires
  </h2>

  <div class="cards">

    <div class="card">
      <h3>🎮 Gaming France</h3>
      <p>
        Une grande communauté gaming multijoueur et compétitive.
      </p>
    </div>

    <div class="card">
      <h3>💻 Dev Community</h3>
      <p>
        Programmation, entraide, bots Discord et développement web.
      </p>
    </div>

    <div class="card">
      <h3>🎵 Chill Music</h3>
      <p>
        Musique, détente et discussions communautaires.
      </p>
    </div>

  </div>

</section>

<footer>

  © 2026 Partage-Ton-Serveur — Tous droits réservés

</footer>

</body>
</html>
