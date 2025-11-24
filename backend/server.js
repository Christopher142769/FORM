// server/server.js - BACKEND FINAL (v2.1 : Exportation CSV/Excel + Logique Conditionnelle Schema)

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
const FRONTEND_URL = process.env.FRONTEND_URL || "https://startup-form.onrender.com"; 
const PORT = process.env.PORT || 5000; 
const JWT_SECRET = process.env.JWT_SECRET || 'SECRET_PAR_DEFAUT_NE_PAS_UTILISER_EN_PROD'; 

// --- 1. Middleware de base ---
// Augmentation de la limite pour l'upload potentiel de logo (en base64) et de configurations complexes.
app.use(cors());
app.use(express.json({ limit: '50mb' })); 

// --- 2. Configuration MongoDB ---
const MONGODB_URI = process.env.MONGODB_URI; 

if (!MONGODB_URI) {
    console.error("ERREUR: La variable d'environnement MONGODB_URI n'est pas définie. Connexion à MongoDB impossible.");
}

mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connexion à MongoDB réussie !'))
    .catch(err => console.error('Erreur de connexion à MongoDB:', err));


// --- 3. Schémas et Modèles Mongoose ---

// Schéma de l'utilisateur
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    companyName: { type: String, default: 'Mon Entreprise' }
});

// Schéma pour les soumissions
const SubmissionSchema = new mongoose.Schema({
    submittedAt: { type: Date, default: Date.now },
    data: { type: mongoose.Schema.Types.Mixed, required: true }, // Pour stocker les données variables
});

// Schéma pour un champ (inclut la configuration de l'upload et la logique conditionnelle)
const FieldSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // ID unique pour la manipulation côté client
    type: { type: String, required: true }, // ex: text, email, radio, select, file
    label: { type: String, required: true },
    placeholder: { type: String },
    required: { type: Boolean, default: false }, 
    options: [String], // Pour radio/select
    conditionalLogic: [{ // 💡 Stockage de la logique conditionnelle
        value: { type: String, required: true }, // La valeur de l'option qui déclenche
        showFieldId: { type: String, required: true } // L'ID du champ à afficher
    }],
    fileConfig: { // Configuration pour les champs de type 'file'
        maxSize: { type: Number, default: 2 }, // Taille max en MB
        allowedTypes: [String], // ex: ['image/png', 'application/pdf']
    }
}, { _id: false }); // Important: ne pas créer un _id Mongoose par défaut pour le FieldSchema

// Schéma du formulaire (le conteneur principal)
const FormSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    token: { type: String, unique: true, required: true }, // Jeton public (UUID)
    title: { type: String, required: true },
    description: { type: String, default: '' },
    isPublished: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    logoBase64: { type: String, default: null }, // Pour stocker le logo en Base64
    fields: [FieldSchema], // Tableau des champs du formulaire
    submissions: [SubmissionSchema], // Tableau des soumissions reçues
    views: { type: Number, default: 0 }, // Compteur de vues
});


const User = mongoose.model('User', UserSchema);
const Form = mongoose.model('Form', FormSchema);


// --- 4. Middleware d'Authentification (JWT) ---
const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Get token from header
            token = req.headers.authorization.split(' ')[1];

            // Verify token
            const decoded = jwt.verify(token, JWT_SECRET);

            // Get user id from token payload
            req.user = decoded.id; 

            next();
        } catch (error) {
            console.error(error);
            res.status(401).json({ message: 'Non autorisé, jeton invalide' });
        }
    }

    if (!token) {
        res.status(401).json({ message: 'Non autorisé, pas de jeton' });
    }
};

// --- 5. Routes API ---

// A. Authentification
app.post('/api/auth/register', async (req, res) => {
    const { username, password, companyName } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Veuillez fournir un nom d\'utilisateur et un mot de passe.' });
    }

    try {
        const userExists = await User.findOne({ username });
        if (userExists) {
            return res.status(400).json({ message: 'Ce nom d\'utilisateur existe déjà.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({
            username,
            password: hashedPassword,
            companyName: companyName || 'Mon Entreprise'
        });

        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '30d' });

        res.status(201).json({
            _id: user._id,
            username: user.username,
            companyName: user.companyName,
            token,
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de l\'enregistrement de l\'utilisateur.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });

        if (user && (await bcrypt.compare(password, user.password))) {
            const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '30d' });

            res.json({
                _id: user._id,
                username: user.username,
                companyName: user.companyName,
                token,
            });
        } else {
            res.status(401).json({ message: 'Identifiants invalides' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de la connexion.' });
    }
});

// B. Gestion des Formulaires (CRUD)
app.post('/api/forms', protect, async (req, res) => {
    const { title } = req.body;

    if (!title) {
        return res.status(400).json({ message: 'Le titre du formulaire est requis.' });
    }

    try {
        // Générer un jeton simple pour l'URL publique
        const token = new mongoose.Types.ObjectId().toHexString(); // Simule un token unique simple

        const form = await Form.create({
            userId: req.user,
            title,
            token,
            fields: [] // Nouveau formulaire vide
        });

        res.status(201).json(form);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de la création du formulaire.' });
    }
});

app.get('/api/forms', protect, async (req, res) => {
    try {
        // Récupérer les formulaires de l'utilisateur actuel
        const forms = await Form.find({ userId: req.user }).select('-submissions').sort({ createdAt: -1 });
        res.json(forms);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de la récupération des formulaires.' });
    }
});

app.get('/api/forms/:id', protect, async (req, res) => {
    try {
        const form = await Form.findById(req.params.id).select('-submissions');
        if (!form || form.userId.toString() !== req.user) {
            return res.status(404).json({ message: 'Formulaire non trouvé ou accès refusé.' });
        }
        res.json(form);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de la récupération du formulaire.' });
    }
});

app.put('/api/forms/:id', protect, async (req, res) => {
    try {
        const form = await Form.findById(req.params.id);

        if (!form || form.userId.toString() !== req.user) {
            return res.status(404).json({ message: 'Formulaire non trouvé ou accès refusé.' });
        }

        // Mise à jour : le frontend envoie tout le corps du formulaire (fields, title, description, logoBase64)
        const updatedForm = await Form.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true, runValidators: true } // 'new: true' retourne le doc mis à jour
        ).select('-submissions');

        res.json(updatedForm);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de la mise à jour du formulaire.' });
    }
});

app.delete('/api/forms/:id', protect, async (req, res) => {
    try {
        const form = await Form.findById(req.params.id);

        if (!form || form.userId.toString() !== req.user) {
            return res.status(404).json({ message: 'Formulaire non trouvé ou accès refusé.' });
        }

        await Form.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'Formulaire supprimé avec succès.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de la suppression du formulaire.' });
    }
});


// C. Formulaire Public (Rendu et Soumission)
app.get('/api/public/form/:token', async (req, res) => {
    try {
        const form = await Form.findOne({ token: req.params.token }).select('-submissions');

        if (!form || !form.isPublished) {
            return res.status(404).json({ message: 'Formulaire non trouvé ou non publié.' });
        }
        
        // 💡 Mettre à jour le compteur de vues (sans attendre)
        Form.updateOne({ _id: form._id }, { $inc: { views: 1 } }).exec();

        // Créer un objet de formulaire minimal pour le public
        const publicForm = {
            title: form.title,
            description: form.description,
            logoBase64: form.logoBase64,
            fields: form.fields.map(field => ({
                type: field.type,
                label: field.label,
                placeholder: field.placeholder,
                required: field.required,
                options: field.options,
                conditionalLogic: field.conditionalLogic, // Inclure la logique conditionnelle
                fileConfig: field.fileConfig,
            })),
            token: form.token
        };

        res.json(publicForm);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de la récupération du formulaire public.' });
    }
});

app.post('/api/public/submit/:token', async (req, res) => {
    const formData = req.body; 

    if (Object.keys(formData).length === 0) {
        return res.status(400).json({ message: 'La soumission est vide.' });
    }

    try {
        const form = await Form.findOne({ token: req.params.token });

        if (!form || !form.isPublished) {
            return res.status(404).json({ message: 'Formulaire non trouvé ou non publié.' });
        }

        // 🚨 IMPORTANT: Validation des champs requis
        const requiredFields = form.fields.filter(f => f.required);
        for (const field of requiredFields) {
            const fieldKey = field.label.toLowerCase().replace(/[^a-z0-9]/g, '_');
            if (formData[fieldKey] === undefined || formData[fieldKey] === null || formData[fieldKey] === '') {
                // Pour une validation complète, il faudrait aussi vérifier la logique conditionnelle ici
                return res.status(400).json({ message: `Le champ requis '${field.label}' est manquant.` });
            }
        }
        
        // Créer le nouvel objet de soumission
        const newSubmission = {
            data: formData,
            submittedAt: new Date(),
        };

        // Ajouter la soumission et sauvegarder
        form.submissions.push(newSubmission);
        await form.save();

        res.status(201).json({ message: 'Soumission enregistrée avec succès!', submissionId: newSubmission._id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de la soumission du formulaire.' });
    }
});


// D. Statistiques et Détails
app.get('/api/forms/:id/stats', protect, async (req, res) => {
    try {
        const form = await Form.findById(req.params.id);
        if (!form || form.userId.toString() !== req.user) {
            return res.status(404).json({ message: 'Formulaire non trouvé ou accès refusé.' });
        }

        // Récupérer les clés uniques de toutes les soumissions
        const allKeys = form.submissions.reduce((keys, sub) => {
            const dataKeys = sub.data ? Object.keys(sub.data) : [];
            return [...new Set([...keys, ...dataKeys])];
        }, []);

        const stats = {
            _id: form._id, // Ajouter l'ID pour l'exportation
            title: form.title,
            views: form.views,
            submissionCount: form.submissions.length,
            conversionRate: form.views > 0 ? ((form.submissions.length / form.views) * 100).toFixed(2) : 0,
            allSubmissionKeys: allKeys, // Inclure les clés uniques pour le frontend
            submissions: form.submissions.map(sub => ({
                data: sub.data || {}, // Assurer un objet par défaut
                submittedAt: sub.submittedAt,
            }))
        };
        res.json(stats);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de la récupération des statistiques.' });
    }
});

// 💡 NOUVEAU : Endpoint pour l'export des données (CSV/Excel)
app.get('/api/forms/:id/export', protect, async (req, res) => {
    try {
        const form = await Form.findById(req.params.id);
        if (!form || form.userId.toString() !== req.user) {
            return res.status(404).json({ message: 'Formulaire non trouvé ou accès refusé.' });
        }
        
        const format = req.query.format; // 'csv' ou 'pdf'
        const submissions = form.submissions.map(sub => sub.data || {});

        if (submissions.length === 0) {
            return res.status(404).json({ message: 'Aucune soumission à exporter.' });
        }

        // 1. Collecter toutes les clés uniques pour les en-têtes
        const allKeys = submissions.reduce((keys, data) => {
            return [...new Set([...keys, ...Object.keys(data)])];
        }, []);
        
        // Nettoyer les en-têtes (remplacer les _ par des espaces et mettre en majuscule pour la lisibilité)
        const headerRow = allKeys.map(key => `"${key.toUpperCase().replace(/_/g, ' ')}"`).join(';');


        // 2. Préparer les données au format tabulaire (CSV)
        const csvData = [
            headerRow, // En-têtes
            ...submissions.map(sub => allKeys.map(key => {
                let value = sub[key] !== undefined ? sub[key] : '';
                
                // Gérer les valeurs multiples (par ex., checkbox group)
                if (Array.isArray(value)) {
                    value = value.join(', ');
                }
                
                // Simple échappement pour les CSV (remplacer les doubles quotes par des doubles doubles quotes, et encadrer)
                return `"${String(value).replace(/"/g, '""')}"`;
            }).join(';')) // Utilisation du point-virgule comme séparateur pour la compatibilité Excel FR
        ].join('\n');
        
        // 3. Envoyer le fichier
        if (format === 'csv') { // Gère 'excel' via le frontend qui demande 'csv'
             res.setHeader('Content-Type', 'text/csv');
             res.setHeader('Content-Disposition', `attachment; filename="${form.title}_export_${new Date().toISOString().slice(0, 10)}.csv"`);
             // Ajout du BOM (Byte Order Mark) pour l'encodage UTF-8 et la compatibilité Excel
             return res.send(Buffer.from('\ufeff' + csvData, 'utf8')); 
        } else if (format === 'pdf') {
             // La génération de PDF est complexe. On simule un message d'erreur.
             return res.status(501).json({ message: "La génération de PDF n'est pas encore supportée sur ce backend de démonstration. Veuillez utiliser l'export Excel (CSV)." });
        }

        return res.status(400).json({ message: 'Format d\'exportation non supporté.' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur lors de l\'exportation des données.' });
    }
});


// E. ROUTE DE REDIRECTION PUBLIQUE (INCHANGÉE)
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
    console.log(`JWT_SECRET chargé : ${JWT_SECRET.substring(0, 5)}...`);
});