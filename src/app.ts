import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { ErrorMiddleware } from './middlewares/error';

import userRoute from './routes/user.route';
import postRoute from './routes/post.route';

export const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(cors({origin : process.env.ORIGIN}));

app.get('/', (req : Request, res : Response) => res.status(200).json({success : true, message : 'Welcome'}));

app.use('/api/v1/user', userRoute);
app.use('/api/v1/post', postRoute);

app.get('*', (req : Request, res : Response, next : NextFunction) => {
    const error = new Error(`Route ${req.originalUrl} not found`);
    next(error);
});

app.use(ErrorMiddleware);