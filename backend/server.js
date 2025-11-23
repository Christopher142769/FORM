// server/server.js - TOUT LE BACKEND EN UN SEUL FICHIER (FINAL + ENV VARS V2)

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

// Récupère l'URL du frontend pour la redirection et les liens publics.
// 🚨 CORRECTION: Suppression du slash final dans la valeur par défaut pour éviter les conflits de routage.
const FRONTEND_URL = process.env.FRONTEND_URL || "https://startup-form.onrender.com"; 
// Récupère le port ou utilise 5000 par défaut
const PORT = process.env.PORT || 5000; 
// Récupère la clé secrète JWT 
const JWT_SECRET = process.env.JWT_SECRET || 'SECRET_PAR_DEFAUT_NE_PAS_UTILISER_EN_PROD'; 

// --- 1. Middleware de base ---
app.use(cors());
app.use(express.json({ limit: '50mb' })); 

// --- 2. Configuration MongoDB ---

// Utilise process.env.MONGODB_URI
const MONGODB_URI = process.env.MONGODB_URI; 

if (!MONGODB_URI) {
    console.error("ERREUR: La variable d'environnement MONGODB_URI n'est pas définie. Connexion à MongoDB impossible.");
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

// --- 5. Routes API ---

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
            return res.status(500).json({ message: "Erreur de configuration : FRONTEND_URL non défini." });
        }
        // 💡 UTILISATION SANS SLASH: Assure la compatibilité
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

app.get('/api/forms', protect, async (req, res) => {
    try {
        const forms = await Form.find({ userId: req.user }).select('title createdAt submissions');
        res.json(forms.map(form => ({
            _id: form._id,
            title: form.title,
            createdAt: form.createdAt,
            submissions: form.submissions.length
        })));
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la récupération des formulaires.' });
    }
});

app.post('/api/forms/:id/logo', protect, async (req, res) => {
    try {
        const form = await Form.findOne({ _id: req.params.id, userId: req.user });
        if (!form) {
            return res.status(404).json({ message: 'Formulaire non trouvé.' });
        }
        
        const { logoData } = req.body;
        if (!logoData || !logoData.startsWith('data:image')) {
            return res.status(400).json({ message: 'Format de données de logo invalide.' });
        }

        form.logoPath = logoData; 
        await form.save();
        
        res.json({ message: 'Logo mis à jour avec succès.', logoPath: form.logoPath });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de l\'upload du logo.' });
    }
});

// C. Routes Publiques (Soumission) (INCHANGÉES)
app.get('/api/public/form/:token', async (req, res) => {
    try {
        const form = await Form.findOne({ urlToken: req.params.token }).select('title fields logoPath urlToken');
        if (!form) {
            return res.status(404).json({ message: 'Formulaire non trouvé.' });
        }
        
        form.views += 1;
        await form.save();

        res.json(form);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la récupération du formulaire.' });
    }
});

app.post('/api/public/form/:token/submit', async (req, res) => {
    try {
        const submissionData = req.body;
        const form = await Form.findOne({ urlToken: req.params.token });
        if (!form) {
            return res.status(404).json({ message: 'Formulaire non trouvé.' });
        }

        form.submissions.push({ data: submissionData });
        await form.save();
        res.status(201).json({ message: 'Soumission enregistrée avec succès !' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la soumission.' });
    }
});

// D. Statistiques et Détails (Dashboard) (INCHANGÉES)
app.get('/api/forms/:id/stats', protect, async (req, res) => {
    try {
        const form = await Form.findById(req.params.id);
        if (!form || form.userId.toString() !== req.user) {
            return res.status(404).json({ message: 'Formulaire non trouvé ou accès refusé.' });
        }

        const stats = {
            title: form.title,
            views: form.views,
            submissionCount: form.submissions.length,
            conversionRate: form.views > 0 ? ((form.submissions.length / form.views) * 100).toFixed(2) : 0,
            submissions: form.submissions.map(sub => ({
                data: sub.data,
                submittedAt: sub.submittedAt,
            }))
        };
        res.json(stats);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de la récupération des statistiques.' });
    }
});


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
    // Affichage des premières lettres des secrets pour vérifier qu'ils sont chargés
    console.log(`JWT SECRET: ${JWT_SECRET.substring(0, 5)}...`);
    console.log(`MongoDB URI: ${MONGODB_URI ? MONGODB_URI.substring(0, 30) + '...' : 'NON DÉFINI'}`);
});