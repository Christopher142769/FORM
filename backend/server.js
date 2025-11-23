// server/server.js - TOUT LE BACKEND EN UN SEUL FICHIER (FINAL + DOTENV)

const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const QRCode = require('qrcode');
// 💡 AJOUT : Chargement des variables d'environnement
require('dotenv').config(); 

const app = express();
// 💡 MODIFIÉ : Utilisation de process.env.PORT
const PORT = process.env.PORT || 5000; 
// 💡 MODIFIÉ : Utilisation de process.env.JWT_SECRET
const JWT_SECRET = process.env.JWT_SECRET; 

// --- 1. Middleware de base ---
app.use(cors());
app.use(express.json({ limit: '50mb' })); 

// --- 2. Configuration MongoDB ---
// 💡 MODIFIÉ : Utilisation de process.env.MONGODB_URI
const MONGODB_URI = process.env.MONGODB_URI; 

mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connexion à MongoDB réussie !'))
    .catch(err => console.error('Erreur de connexion à MongoDB:', err));

// --- 3. Modèles Mongoose (INCHANGÉS) ---
// Schéma pour l'Utilisateur (Entreprise)
const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    companyName: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
});
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});
const User = mongoose.model('User', UserSchema);

// Schéma pour le Formulaire
const FormSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    fields: { type: Array, default: [] }, 
    logoPath: { type: String },
    submissions: [{
        data: { type: Object, default: {} }, 
        submittedAt: { type: Date, default: Date.now },
    }],
    views: { type: Number, default: 0 },
    urlToken: { type: String, unique: true, required: true }, 
    createdAt: { type: Date, default: Date.now },
});
const Form = mongoose.model('Form', FormSchema);

// --- 4. Middleware d'Authentification (JWT) ---
const protect = (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // 💡 Utilisation de la constante JWT_SECRET
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded.id; 
            next();
        } catch (error) {
            return res.status(401).json({ message: 'Non autorisé, token invalide ou expiré.' });
        }
    } else {
        res.status(401).json({ message: 'Non autorisé, pas de token Bearer.' });
    }
};

// --- 5. Routes API (INCHANGÉES, sauf pour l'utilisation de JWT_SECRET dans Auth) ---

// A. Routes d'Authentification
app.post('/api/auth/register', async (req, res) => {
    const { email, password, companyName } = req.body;
    try {
        const user = await User.create({ email, password, companyName });
        // 💡 Utilisation de la constante JWT_SECRET
        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1d' }); 
        res.status(201).json({ 
            token, 
            user: { id: user._id, email: user.email, companyName: user.companyName } 
        });
    } catch (error) {
        if (error.code === 11000) { 
            return res.status(400).json({ message: 'Cet email est déjà utilisé.' });
        }
        res.status(400).json({ message: 'Erreur lors de l\'inscription.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (user && (await bcrypt.compare(password, user.password))) {
            // 💡 Utilisation de la constante JWT_SECRET
            const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1d' }); 
            res.json({ 
                token, 
                user: { id: user._id, email: user.email, companyName: user.companyName } 
            });
        } else {
            res.status(401).json({ message: 'Email ou mot de passe invalide.' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});

app.get('/api/auth/me', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user).select('-password');
        if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé.' });
        res.json({ user: { id: user._id, email: user.email, companyName: user.companyName } });
    } catch (error) {
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});

// B. Routes de Gestion des Formulaires (Dashboard) - (Reste inchangé)
app.post('/api/forms', protect, async (req, res) => {
    const { title, fields, _id } = req.body;
    // ... (Logique de création/mise à jour)
    try {
        let form;
        let publicUrl;
        
        if (_id) {
            form = await Form.findOneAndUpdate(
                { _id, userId: req.user }, 
                { title, fields }, 
                { new: true }
            );
            if (!form) return res.status(404).json({ message: 'Formulaire non trouvé ou non autorisé.' });
            
            publicUrl = `http://localhost:3000/form/${form.urlToken}`;
            
        } else {
            const urlToken = new mongoose.Types.ObjectId().toString();
            form = await Form.create({ title, fields, userId: req.user, urlToken });
            publicUrl = `http://localhost:3000/form/${form.urlToken}`; 
        }

        const qrCodeDataURL = await QRCode.toDataURL(publicUrl);

        res.status(_id ? 200 : 201).json({ 
            form: {
                _id: form._id,
                title: form.title,
                urlToken: form.urlToken
            },
            publicUrl, 
            qrCodeDataURL 
        });

    } catch (error) {
        console.error("Erreur de sauvegarde:", error);
        res.status(500).json({ message: 'Erreur lors de la sauvegarde du formulaire.' });
    }
});

app.get('/api/forms', protect, async (req, res) => {
    try {
        const forms = await Form.find({ userId: req.user }).select('title createdAt views submissions logoPath _id urlToken fields');
        
        const formsWithCount = forms.map(form => ({
            ...form.toObject(),
            submissions: form.submissions.length,
        }));
        res.json(formsWithCount);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la récupération des formulaires.' });
    }
});

app.post('/api/forms/:id/logo', protect, async (req, res) => {
    const { logoData } = req.body; 
    // ... (Logique d'upload de logo)
    if (!logoData || typeof logoData !== 'string' || !logoData.startsWith('data:image')) {
        return res.status(400).json({ message: 'Format de logo invalide. La Data URL Base64 est requise.' });
    }

    try {
        const form = await Form.findById(req.params.id);
        if (!form || form.userId.toString() !== req.user) {
            return res.status(404).json({ message: 'Formulaire non trouvé ou accès refusé.' });
        }

        form.logoPath = logoData;
        await form.save();

        res.json({ message: 'Logo stocké avec succès dans MongoDB', logoPath: logoData });
    } catch (error) {
        console.error("Erreur de stockage du logo:", error);
        res.status(500).json({ message: 'Erreur lors du stockage du logo.' });
    }
});

// C. Route de Consultation et Soumission (Publique) - (Reste inchangé)
app.get('/api/public/form/:token', async (req, res) => {
    try {
        const form = await Form.findOne({ urlToken: req.params.token }).select('title fields logoPath');
        if (!form) {
            return res.status(404).json({ message: 'Formulaire non trouvé.' });
        }
        
        await Form.updateOne({ _id: form._id }, { $inc: { views: 1 } });
        
        res.json(form);
    } catch (error) {
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});

app.post('/api/public/form/:token/submit', async (req, res) => {
    const submissionData = req.body;
    try {
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

// D. Statistiques et Détails (Dashboard) - (Reste inchangé)
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
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});


// --- 6. Démarrage du Serveur ---
app.listen(PORT, () => {
    console.log(`Serveur Node.js démarré sur http://localhost:${PORT}`);
});