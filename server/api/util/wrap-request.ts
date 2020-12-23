import { Request, Response } from 'express';

export default function wrapRequest(controllerFn: (req: Request, res: Response) => any) {
    return async function wrappedRequest(req: Request, res: Response) {
        try {
            const response = await controllerFn(req, res);
            res.json({ data: response });
        } catch (err) {
            const errors = err.errors || [{ message: err.message }];
            res.status(err.status || 500).json({ errors });
        }
    }
}