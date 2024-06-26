import type { TInferSelectComment, TInferSelectPost, TInferSelectReplies } from '../@types';
import { deleteComment, deleteReplay, findPostComments, insertComment, insertPostComment, insertReplay, updateCommentDetails, updateReplay } 
from '../db/db-query/comment.query';
import { deleteCache, deleteInCacheList, findInCache, insertIntoCache } from '../db/redis-query';
import { deleteCommentInPostCache, deleteRepliesOnCommentCache, findCommentsIdInCache, findRequestedKeyInCacheList, insertCommentToCache, insertReplayToCache } from '../db/redis-query/comment.cache';
import { ForbiddenError, ResourceNotFoundError } from '../utils/customErrors';
import ErrorHandler from '../utils/errorHandler';

export const addComment = async (postId : string, userId : string, text : string) => {
    try {
        const isPostExists : TInferSelectPost = await findInCache(`post:${postId}`);
        if(Object.keys(isPostExists).length <= 0) throw new ResourceNotFoundError();
        const comment = await insertComment(userId, text);

        await insertPostComment(postId, comment.id);
        await insertCommentToCache(postId, comment);
        return comment;

    } catch (error : any) {
        throw new ErrorHandler(`An error occurred: ${error.message}`, error.statusCode);
    }
}

export const getPostComments = async (postId : string, limit : number, offset : number) : Promise<TInferSelectComment[]> => {
    try {
        const isPostExists : TInferSelectPost = await findInCache(`post:${postId}`);
        const commentIds = await findCommentsIdInCache(postId, limit, offset);

        if (!isPostExists || commentIds.length <= 0) {
            const comments = await findPostComments(postId);
            await Promise.all(comments.map(async comment => {
                await insertCommentToCache(postId, comment);
            }));
            return comments.slice(0, 10) as TInferSelectComment[];
        }

        const comments : TInferSelectComment[] = await Promise.all(commentIds.map(async commentId => {
            const comment : TInferSelectComment = await findInCache(commentId);
            return mapRedisDataToComment(comment);
        }));
        const sorted = comments.sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());
        return sorted

    } catch (error: any) {
        throw new ErrorHandler(`An error occurred: ${error.message}`, error.statusCode);
    }
}

const mapRedisDataToComment = (data : TInferSelectComment) : TInferSelectComment => {
    return { id : data.id, text: data.text, authorId: data.authorId || null, 
        createdAt: data.createdAt ? new Date(data.createdAt) : null, updatedAt: data.updatedAt ? new Date(data.updatedAt) : null
    };
}

export const updateCommentText = async (commentId : string, authorId : string, text : string) => {
    try {
        const comment : TInferSelectReplies = await findInCache(`comment:${commentId}`);
        if(comment.authorId !== authorId) throw new ForbiddenError();

        await updateCommentDetails(commentId, authorId, text).catch(console.error);
        await insertIntoCache(`comment`, commentId, comment, 1209600);
        return 'Post has been updated';
        
    } catch (error : any) {
        throw new ErrorHandler(`An error occurred: ${error.message}`, error.statusCode);
    }
}

export const deleteSingleCommentService = async (commentId : string, currentUserId : string) => {
    try {
        const key : string = await findRequestedKeyInCacheList('post', 'comments', commentId, 'include') as string;
        if(Object.keys(key).length <= 0) throw new ResourceNotFoundError();

        const comment : TInferSelectComment = await findInCache(`comment:${commentId}`);
        if(comment.authorId !== currentUserId) throw new ForbiddenError();

        await deleteRepliesOnCommentCache(commentId);
        await deleteComment(commentId, currentUserId);

        await deleteCommentInPostCache(key, commentId);
        return 'Comment has been deleted';
        
    } catch (error : any) {
        throw new ErrorHandler(`An error occurred: ${error.message}`, error.statusCode);
    }
}

export const newReplay = async (commentId : string, authorId : string, text : string) => {
    try {
        const replay = await insertReplay(commentId, authorId, text);
        await insertReplayToCache(commentId, replay);
        return replay;

    } catch (error : any) {
        throw new ErrorHandler(`An error occurred: ${error.message}`, error.statusCode);
    }
}

export const getRepliesService = async (commentId : string) => {
    try {
        let replies : TInferSelectReplies[] = [];
        const keys : string[] = await findRequestedKeyInCacheList('comment', 'replies', commentId, 'search') as string[];
        if(keys.length <= 0) throw new ResourceNotFoundError();

        await Promise.all(keys.map(async key => {
            const replay : TInferSelectReplies =  await findInCache(key);
            replies.push(replay);
        }));
        return replies;
        
    } catch (error : any) {
        throw new ErrorHandler(`An error occurred: ${error.message}`, error.statusCode);
    }
}

export const editReplayTextService = async (replayId : string, currentUserId : string, text : string) => {
    try {
        const replay : TInferSelectReplies = await findInCache(`replay:${replayId}`);
        if(replay.authorId !== currentUserId) throw new ForbiddenError();

        const newReplay = await updateReplay(replayId, currentUserId, text);
        await insertIntoCache('replay', replayId, newReplay, 1209600);
        return newReplay;

    } catch (error : any) {
        throw new ErrorHandler(`An error occurred: ${error.message}`, error.statusCode);
    }
}

export const deleteCommentReplayService = async (replayId: string, commentId : string, currentUserId : string) => {
    try {
        const replay : TInferSelectReplies = await findInCache(`replay:${replayId}`);
        if(replay.authorId !== currentUserId) throw new ForbiddenError();

        await Promise.all([deleteInCacheList(`comment:${commentId}:replies`, `replay:${replayId}`), deleteCache(`replay:${replayId}`),
        deleteReplay(replayId, currentUserId)]);

        return 'Replay has been deleted';
        
    } catch (error : any) {
        throw new ErrorHandler(`An error occurred: ${error.message}`, error.statusCode);
    }
}