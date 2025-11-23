// server/server.js - TOUT LE BACKEND EN UN SEUL FICHIER (FINAL + ENV VARS)

const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const QRCode = require('qrcode');
// 💡 CORRECTION : Activation du chargement des variables d'environnement
require('dotenv').config(); 

const app = express();

// --- Définition des Variables d'Environnement ---

// Récupère l'URL du frontend pour la redirection et les liens publics (doit être défini dans .env ou sur Render)
const FRONTEND_URL = "https://startup-form.onrender.com/"; 
// Récupère le port ou utilise 5000 par défaut
const PORT = process.env.PORT || 5000; 
// Récupère la clé secrète JWT (doit être défini dans .env ou sur Render)
const JWT_SECRET = process.env.JWT_SECRET || 'SECRET_PAR_DEFAUT_NE_PAS_UTILISER_EN_PROD'; 

// --- 1. Middleware de base ---
app.use(cors());
app.use(express.json({ limit: '50mb' })); 

// --- 2. Configuration MongoDB ---

// 💡 CORRECTION : Utilise process.env.MONGODB_URI sans fallback localhost (pour forcer l'usage de la chaîne de production)
const MONGODB_URI = process.env.MONGODB_URI; 

if (!MONGODB_URI) {
    console.error("ERREUR: La variable d'environnement MONGODB_URI n'est pas définie.");
    // Optionnel : Quitter si la BDD est critique
    // process.exit(1); 
}

mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connexion à MongoDB réussie !'))
    .catch(err => console.error('Erreur de connexion à MongoDB:', err));


// --- 3. Modèles Mongoose (INCHANGÉ) ---

// Schéma pour l'Utilisateur (Entreprise)
const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    companyName: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

UserSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    next();
});

const User = mongoose.model('User', UserSchema);

// Schéma pour le Formulaire
const FormSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    fields: [{
        label: { type: String, required: true },
        type: { type: String, required: true, enum: ['text', 'textarea', 'email', 'number', 'checkbox'] }
    }],
    logoPath: { type: String, default: '' }, 
    urlToken: { type: String, unique: true },
    views: { type: Number, default: 0 },
    submissions: [{
        data: { type: mongoose.Schema.Types.Mixed },
        submittedAt: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now }
});

FormSchema.pre('save', async function(next) {
    if (this.isNew && !this.urlToken) {
        this.urlToken = this._id.toString(); 
    }
    next();
});

const Form = mongoose.model('Form', FormSchema);

// --- 4. Middleware d'Authentification (INCHANGÉ) ---
const protect = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authentification requise.' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded.userId; 
        next();
    } catch (err) {
        res.status(401).json({ message: 'Token invalide ou expiré.' });
    }
};

// --- 5. Routes API (MODIFIÉES pour utiliser FRONTEND_URL) ---

// A. Authentification (INCHANGÉ)
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, companyName } = req.body;
        if (!email || !password || !companyName) {
            return res.status(400).json({ message: 'Tous les champs sont requis.' });
        }
        const user = new User({ email, password, companyName });
        await user.save();
        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '1h' });
        res.status(201).json({ token, user: { _id: user._id, email: user.email, companyName: user.companyName } });
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ message: 'Cet email est déjà utilisé.' });
        res.status(500).json({ message: 'Erreur lors de l\'inscription.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Email ou mot de passe incorrect.' });
        }
        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, user: { _id: user._id, email: user.email, companyName: user.companyName } });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la connexion.' });
    }
});

app.get('/api/auth/me', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user).select('-password');
        if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé.' });
        res.json({ user });
    } catch (error) {
        res.status(500).json({ message: 'Erreur de vérification du token.' });
    }
});

// B. Gestion des Formulaires (Dashboard)
app.post('/api/forms', protect, async (req, res) => {
    try {
        const { _id, title, fields } = req.body;
        let form;
        let isNew = false;
        
        if (_id) {
            form = await Form.findOne({ _id, userId: req.user });
            if (!form) return res.status(404).json({ message: 'Formulaire non trouvé.' });
            form.title = title;
            form.fields = fields;
        } else {
            isNew = true;
            form = new Form({ userId: req.user, title, fields });
        }
        
        await form.save();

        // 2. Génération du Lien Public utilisant la variable FRONTEND_URL
        if (!FRONTEND_URL) {
            // Sécurité si la variable n'est pas définie
            return res.status(500).json({ message: "Erreur de configuration : FRONTEND_URL non défini." });
        }
        let publicUrl = `${FRONTEND_URL}/form/${form.urlToken}`;
        
        // 3. Génération du QR Code
        const qrCodeDataURL = await QRCode.toDataURL(publicUrl);

        // 4. Réponse
        res.status(isNew ? 201 : 200).json({ 
            form: form, 
            publicUrl, 
            qrCodeDataURL 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de la sauvegarde du formulaire.' });
    }
});

// ... (Routes restantes inchangées, elles utilisent apiUrl fourni par le frontend)

// 🚨 CORRECTION CRITIQUE (Route E)
// E. ROUTE DE REDIRECTION PUBLIQUE
// Intercepte les requêtes sur le domaine du backend et redirige vers le FRONTEND
app.get('/form/:token', async (req, res) => {
    if (!FRONTEND_URL) {
        return res.status(500).send("Erreur de configuration : FRONTEND_URL non défini pour la redirection.");
    }
    // Redirection permanente vers l'URL du frontend
    res.redirect(302, `${FRONTEND_URL}/form/${req.params.token}`);
});


// --- 6. Démarrage du Serveur ---
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
    console.log(`JWT SECRET: ${JWT_SECRET.substring(0, 5)}...`);
    console.log(`MongoDB URI: ${MONGODB_URI.substring(0, 30)}...`);
});