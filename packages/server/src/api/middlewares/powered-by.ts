import { Request, Response, NextFunction } from 'express';

export function poweredByMiddleware(req: Request, res: Response, next: NextFunction) {
    // override X-Powered-By: Express
    res.set('X-Powered-By', 'Sommelier Finance');
    next();
}